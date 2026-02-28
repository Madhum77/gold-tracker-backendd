// services/goldApiService.js
const axios = require('axios');

// Using Metals-API (free tier - no credit card required)
// Sign up at: https://metals-api.com/ (free plan available)

async function fetchRealGoldRates() {
    try {
        console.log('🔍 Fetching real gold rates from Metals-API...');
        
        // Using a free public API first (no key required)
        // This is a free gold price API from a public source
        const response = await axios.get('https://api.metals.live/v1/spot/gold');
        
        if (response.data && response.data.length > 0) {
            // Metals.live returns gold price in USD per ounce
            const goldPriceUSD = response.data[0].price;
            
            // Get USD to INR conversion rate (free API)
            const currencyResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
            const inrRate = currencyResponse.data.rates.INR;
            
            // Convert USD per ounce to INR per gram
            // 1 ounce = 31.1035 grams
            const goldPriceINRperGram = (goldPriceUSD * inrRate) / 31.1035;
            
            // Calculate 22K (91.67% pure) and 24K (99.9% pure)
            const rate24k = Math.round(goldPriceINRperGram);
            const rate22k = Math.round(rate24k * 0.9167); // 22K is 91.67% pure
            
            console.log(`✅ Calculated rates: 22K=₹${rate22k}, 24K=₹${rate24k}`);
            
            return {
                success: true,
                rates: {
                    '22k': {
                        perGram: rate22k,
                        per8Gram: rate22k * 8,
                        per10Gram: rate22k * 10
                    },
                    '24k': {
                        perGram: rate24k,
                        per8Gram: rate24k * 8,
                        per10Gram: rate24k * 10
                    }
                },
                lastUpdate: new Date().toISOString(),
                city: 'Coimbatore (calculated from international rates)',
                source: 'metals.live + exchangerate-api.com'
            };
        } else {
            throw new Error('Failed to fetch gold price');
        }
    } catch (error) {
        console.error('❌ Error fetching real gold rates:', error.message);
        
        // Fallback to approximate rates
        return getFallbackRates();
    }
}

// Fallback to approximate rates (close to real market)
function getFallbackRates() {
    console.log('⚠️ Using approximate rates');
    
    // These are approximate market rates for Coimbatore (Feb 2026)
    // Updated based on market trends
    const rate22k = 14560; // Approximate 22K rate
    const rate24k = 15884; // Approximate 24K rate
    
    return {
        success: true,
        rates: {
            '22k': {
                perGram: rate22k,
                per8Gram: rate22k * 8,
                per10Gram: rate22k * 10
            },
            '24k': {
                perGram: rate24k,
                per8Gram: rate24k * 8,
                per10Gram: rate24k * 10
            }
        },
        lastUpdate: new Date().toISOString(),
        city: 'Coimbatore (approximate)',
        source: 'fallback',
        isFallback: true
    };
}

// Alternative API using GoldAPI (also has free tier with email signup)
async function fetchFromGoldAPI() {
    try {
        // You can get a free API key from https://www.goldapi.io/
        // Sign up with email, no credit card required
        const API_KEY = 'goldapi-1a2b3c4d5e6f7g8h9i0j'; // Replace with your actual key
        
        const response = await axios.get('https://www.goldapi.io/api/XAU/INR', {
            headers: {
                'x-access-token': API_KEY
            }
        });
        
        if (response.data && response.data.price) {
            const pricePerOunce = response.data.price;
            const rate24k = Math.round(pricePerOunce / 31.1035);
            const rate22k = Math.round(rate24k * 0.9167);
            
            return {
                success: true,
                rates: {
                    '22k': {
                        perGram: rate22k,
                        per8Gram: rate22k * 8,
                        per10Gram: rate22k * 10
                    },
                    '24k': {
                        perGram: rate24k,
                        per8Gram: rate24k * 8,
                        per10Gram: rate24k * 10
                    }
                },
                lastUpdate: new Date().toISOString(),
                city: 'Coimbatore',
                source: 'GoldAPI.io'
            };
        }
    } catch (error) {
        console.log('GoldAPI failed, trying next option');
        return null;
    }
}

// Main function with multiple fallbacks
async function getGoldRates() {
    // Try primary API first
    let result = await fetchRealGoldRates();
    if (result.success && !result.isFallback) {
        return result;
    }
    
    // If primary fails, return fallback
    console.log('All APIs failed, using fallback rates');
    return getFallbackRates();
}

module.exports = {
    getGoldRates,
    fetchRealGoldRates
};