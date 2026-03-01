const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==================== IN-MEMORY STORAGE (NO DATABASE NEEDED) ====================
let goldRates = [];
let alerts = [];

// Initialize with realistic data
function initializeData() {
    console.log('📊 Initializing gold rate data...');
    const today = new Date();
    
    // Generate last 30 days of data
    for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        // Base rate around 15200 with small variations
        const base22k = 15200 + Math.round(Math.random() * 400 - 200);
        
        goldRates.push({
            date: date,
            rate22k: base22k,
            rate24k: Math.round(base22k * 1.045),
            change22k: Math.round(Math.random() * 100 - 50),
            change24k: Math.round(Math.random() * 100 - 50)
        });
    }
    console.log('✅ Initialized with', goldRates.length, 'records');
}

// Call initialization
initializeData();

// ==================== API ENDPOINTS ====================

// GET current rates
app.get('/api/current', (req, res) => {
    try {
        const latest = goldRates[goldRates.length - 1] || {
            rate22k: 15288,
            rate24k: 15976,
            change22k: 88,
            change24k: 123
        };
        res.json(latest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET historical data for chart
app.get('/api/historical/:range', (req, res) => {
    try {
        const range = req.params.range;
        let days = 7;
        
        if (range === '30days') days = 30;
        if (range === '3months') days = 90;
        if (range === '6months') days = 180;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const data = goldRates.filter(rate => new Date(rate.date) >= startDate);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create new alert
app.post('/api/alerts', (req, res) => {
    try {
        const newAlert = {
            id: Date.now().toString(),
            ...req.body,
            isActive: true,
            createdAt: new Date()
        };
        alerts.push(newAlert);
        res.status(201).json({ message: 'Alert created successfully', alert: newAlert });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all alerts
app.get('/api/alerts', (req, res) => {
    try {
        const activeAlerts = alerts.filter(alert => alert.isActive).slice(0, 10);
        res.json(activeAlerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE alert
app.delete('/api/alerts/:id', (req, res) => {
    try {
        alerts = alerts.filter(alert => alert.id !== req.params.id);
        res.json({ message: 'Alert deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET prediction
app.get('/api/prediction', (req, res) => {
    try {
        const rates = goldRates.slice(-7).map(d => d.rate22k);
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        const trend = (rates[rates.length-1] - rates[0]) / rates[0];
        
        const prediction = {
            week: Math.round(avgRate * (1 + trend * 0.3)),
            month: Math.round(avgRate * (1 + trend * 0.8)),
            quarter: Math.round(avgRate * (1 + trend * 1.5)),
            confidence: Math.min(85, Math.max(60, 70 + Math.abs(trend) * 100))
        };
        
        res.json(prediction);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== EMAIL SERVICE ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'test@example.com',
        pass: process.env.EMAIL_PASS || 'password'
    }
});

// ==================== BACKGROUND JOBS ====================

// Update rates every hour
cron.schedule('0 * * * *', () => {
    console.log('🔄 Updating gold rates...');
    try {
        const lastRate = goldRates[goldRates.length - 1];
        const change = Math.round(Math.random() * 60 - 30);
        
        const newRate = {
            date: new Date(),
            rate22k: Math.max(14000, lastRate.rate22k + change),
            rate24k: Math.max(14000, Math.round((lastRate.rate22k + change) * 1.045)),
            change22k: change,
            change24k: Math.round(change * 1.045)
        };
        
        goldRates.push(newRate);
        if (goldRates.length > 500) goldRates.shift(); // Keep only last 500 records
        
        console.log(`✅ Rates updated: 22K: ₹${newRate.rate22k} | 24K: ₹${newRate.rate24k}`);
    } catch (error) {
        console.error('Update failed:', error);
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 API endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/api/current`);
    console.log(`   GET  http://localhost:${PORT}/api/historical/7days`);
    console.log(`   POST http://localhost:${PORT}/api/alerts`);
    console.log(`   GET  http://localhost:${PORT}/api/prediction`);
});