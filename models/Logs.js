var mongoose = require('mongoose');

var LogSchema = new mongoose.Schema({
    transmitter: {
        type: String,
        unique: true
    },
    lat: Number,
    lon: Number,
    itu: String,
    qrb: Number,
    stations: [{
        freq: Number,
        pol: String,
        station: String,
        ps: String,
        pi: String,
        pmax: Number,
        firstLog: Date,
        mode: String,
        comment: String,
        audio: String
    }]
});

mongoose.model('Log', LogSchema);
