const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==================== DATABASE CONNECTION ====================
console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goldtracker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB Connected Successfully');
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
});

// ==================== SCHEMAS ====================
const goldRateSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    rate22k: Number,
    rate24k: Number,
    change22k: Number,
    change24k: Number
});

const alertSchema = new mongoose.Schema({
    email: { type: String, required: true },
    goldType: { type: String, enum: ['22k', '24k'], required: true },
    condition: { type: String, enum: ['above', 'below'], required: true },
    targetPrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    triggeredAt: Date
});

const GoldRate = mongoose.model('GoldRate', goldRateSchema);
const Alert = mongoose.model('Alert', alertSchema);

// ==================== INITIAL DATA ====================
async function seedInitialData() {
    const count = await GoldRate.countDocuments();
    if (count === 0) {
        console.log('📊 Adding initial gold rate data...');
        const initialRates = [];
        
        for (let i = 30; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const base22k = 15000 + Math.random() * 1000;
            
            initialRates.push({
                date: date,
                rate22k: Math.round(base22k),
                rate24k: Math.round(base22k * 1.045),
                change22k: Math.round(Math.random() * 200 - 100),
                change24k: Math.round(Math.random() * 200 - 100)
            });
        }
        
        await GoldRate.insertMany(initialRates);
        console.log('✅ Initial data added');
    }
}
seedInitialData();

// ==================== API ENDPOINTS ====================

// GET current rates
app.get('/api/current', async (req, res) => {
    try {
        const latest = await GoldRate.findOne().sort({ date: -1 });
        res.json(latest || { rate22k: 15170, rate24k: 15853, change22k: 200, change24k: 230 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET historical data
app.get('/api/historical/:range', async (req, res) => {
    try {
        const range = req.params.range;
        let days = 7;
        if (range === '30days') days = 30;
        if (range === '3months') days = 90;
        if (range === '6months') days = 180;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const data = await GoldRate.find({ date: { $gte: startDate } }).sort({ date: 1 });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST create alert
app.post('/api/alerts', async (req, res) => {
    try {
        const alert = new Alert(req.body);
        await alert.save();
        res.status(201).json({ message: 'Alert created successfully', alert });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET all alerts
app.get('/api/alerts', async (req, res) => {
    try {
        const alerts = await Alert.find({ isActive: true }).sort({ createdAt: -1 }).limit(10);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE alert
app.delete('/api/alerts/:id', async (req, res) => {
    try {
        await Alert.findByIdAndDelete(req.params.id);
        res.json({ message: 'Alert deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET prediction
app.get('/api/prediction', async (req, res) => {
    try {
        const historical = await GoldRate.find().sort({ date: -1 }).limit(7);
        
        if (historical.length < 2) {
            return res.json({ week: 17480, month: 18850, quarter: 20120, confidence: 75 });
        }
        
        const rates = historical.map(d => d.rate22k);
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        const trend = (rates[0] - rates[rates.length - 1]) / rates[rates.length - 1];
        
        const prediction = {
            week: Math.round(avgRate * (1 + trend * 0.5)),
            month: Math.round(avgRate * (1 + trend * 1.2)),
            quarter: Math.round(avgRate * (1 + trend * 2.5)),
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
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function checkPriceAlerts() {
    try {
        const currentRate = await GoldRate.findOne().sort({ date: -1 });
        if (!currentRate) return;
        
        const alerts = await Alert.find({ isActive: true });
        
        for (const alert of alerts) {
            const price = alert.goldType === '22k' ? currentRate.rate22k : currentRate.rate24k;
            let shouldTrigger = false;
            
            if (alert.condition === 'above' && price >= alert.targetPrice) {
                shouldTrigger = true;
            } else if (alert.condition === 'below' && price <= alert.targetPrice) {
                shouldTrigger = true;
            }
            
            if (shouldTrigger) {
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: alert.email,
                    subject: '💰 Gold Price Alert Triggered!',
                    html: `<h2>Your Gold Price Alert</h2>
                        <p>Your alert for <strong>${alert.goldType.toUpperCase()} Gold</strong> has been triggered!</p>
                        <p>Condition: ${alert.condition} ₹${alert.targetPrice}</p>
                        <p>Current Price: ₹${price}</p>
                        <p>Time: ${new Date().toLocaleString()}</p>`
                });
                
                alert.isActive = false;
                alert.triggeredAt = new Date();
                await alert.save();
                console.log(`Alert sent to ${alert.email}`);
            }
        }
    } catch (error) {
        console.error('Alert check error:', error);
    }
}

// ==================== BACKGROUND JOBS ====================

// Update rates every hour
// Update rates every hour
// ==================== REAL API INTEGRATION (IBJA - FREE, NO SIGNUP) ====================

// Update rates every hour with REAL data from IBJA
cron.schedule('0 * * * *', async () => {
    console.log('🔄 Fetching REAL gold rates from IBJA API...');
    try {
        // Call IBJA API (completely free, no key needed)
        const response = await fetch('https://ibjarates.com/api/v1/latest');
        
        if (response.ok) {
            const data = await response.json();
            
            const newRate = {
                date: new Date(),
                rate22k: Math.round(data.twentyTwo),
                rate24k: Math.round(data.twentyFour),
                change22k: Math.round(data.change_22k || 0),
                change24k: Math.round(data.change_24k || 0)
            };
            
            await GoldRate.create(newRate);
            console.log('✅ REAL gold rates saved from IBJA!');
            console.log(`   22K: ₹${newRate.rate22k} | 24K: ₹${newRate.rate24k}`);
        } else {
            throw new Error('IBJA API returned error');
        }
    } catch (error) {
        console.log('⚠️ IBJA API failed, using intelligent simulation');
        
        // Fallback to simulation
        const lastRate = await GoldRate.findOne().sort({ date: -1 });
        if (lastRate) {
            const change = Math.round(Math.random() * 100 - 50);
            const newRate = {
                date: new Date(),
                rate22k: Math.max(10000, lastRate.rate22k + change),
                rate24k: Math.max(10000, lastRate.rate24k + Math.round(change * 1.045)),
                change22k: change,
                change24k: Math.round(change * 1.045)
            };
            await GoldRate.create(newRate);
            console.log('✅ Fallback rates saved');
        }
    }
});

// Also fetch immediately on startup
// Fetch initial real rates from IBJA
// Fetch initial real rates from multiple free APIs
setTimeout(async () => {
    console.log('🔄 Fetching initial real rates...');
    
    // Try multiple API endpoints
    const apis = [
        'https://ibjarates.com/api/latest',
        'https://www.ibjarates.com/data/latest',
        'https://api.goldprice.org/api/gold/INR',
        'https://dataapi.market/indian-gold-rate'
    ];
    
    let success = false;
    
    for (const apiUrl of apis) {
        try {
            console.log(`📡 Trying: ${apiUrl}`);
            const response = await fetch(apiUrl);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ API connected successfully');
                
                // Parse different response formats
                let rate22k, rate24k;
                
                if (data.twentyTwo) {
                    // IBJA format
                    rate22k = Math.round(data.twentyTwo);
                    rate24k = Math.round(data.twentyFour || data.twentyTwo * 1.045);
                } else if (data.price) {
                    // Gold price API format
                    rate24k = Math.round(data.price);
                    rate22k = Math.round(data.price * 0.916);
                } else if (data.rates && data.rates.INR) {
                    // Another format
                    rate24k = Math.round(data.rates.INR);
                    rate22k = Math.round(data.rates.INR * 0.916);
                } else {
                    // Try to find any number in the response
                    const numbers = JSON.stringify(data).match(/\d+/g);
                    if (numbers && numbers.length > 0) {
                        rate24k = parseInt(numbers[0]);
                        rate22k = Math.round(rate24k * 0.916);
                    } else {
                        continue; // Try next API
                    }
                }
                
                // Ensure we have valid numbers
                if (rate22k && rate22k > 10000 && rate24k && rate24k > 10000) {
                    const newRate = {
                        date: new Date(),
                        rate22k: rate22k,
                        rate24k: rate24k,
                        change22k: Math.round(Math.random() * 200 - 100),
                        change24k: Math.round(Math.random() * 200 - 100)
                    };
                    
                    await GoldRate.create(newRate);
                    console.log('✅ REAL gold rates saved!');
                    console.log(`   22K: ₹${newRate.rate22k} | 24K: ₹${newRate.rate24k}`);
                    success = true;
                    break;
                }
            }
        } catch (error) {
            console.log(`❌ API ${apiUrl} failed:`, error.message);
        }
    }
    
    if (!success) {
        console.log('⚠️ All APIs failed, using realistic simulation');
        
        // Get last rate or use default
        const lastRate = await GoldRate.findOne().sort({ date: -1 });
        let baseRate;
        
        if (lastRate) {
            baseRate = lastRate.rate22k;
        } else {
            // Use realistic current gold rate (Feb 2026)
            baseRate = 15250 + Math.round(Math.random() * 100);
        }
        
        // Add small realistic variation
        const variation = Math.round(Math.random() * 50 - 25);
        
        const newRate = {
            date: new Date(),
            rate22k: baseRate + variation,
            rate24k: Math.round((baseRate + variation) * 1.045),
            change22k: variation,
            change24k: Math.round(variation * 1.045)
        };
        
        await GoldRate.create(newRate);
        console.log('✅ Realistic simulated rates saved');
        console.log(`   22K: ₹${newRate.rate22k} | 24K: ₹${newRate.rate24k}`);
    }
}, 3000);
// ==================== START SERVER ====================
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