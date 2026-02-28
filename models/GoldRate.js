const mongoose = require('mongoose');

const goldRateSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    rates: {
        '22k': {
            perGram: { type: Number, required: true },
            per8Gram: { type: Number, required: true },
            per10Gram: { type: Number, required: true }
        },
        '24k': {
            perGram: { type: Number, required: true },
            per8Gram: { type: Number, required: true },
            per10Gram: { type: Number, required: true }
        }
    },
    change: {
        '22k': { type: Number, default: 0 },
        '24k': { type: Number, default: 0 }
    },
    changePercent: {
        '22k': { type: Number, default: 0 },
        '24k': { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Create index for faster queries
goldRateSchema.index({ date: -1 });

// Create and export the model
const GoldRate = mongoose.model('GoldRate', goldRateSchema);
module.exports = GoldRate;