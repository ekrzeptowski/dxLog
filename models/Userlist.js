var mongoose = require('mongoose');

var LogSchema = new mongoose.Schema({
    freq: Number,
    ITU: String,
    lang: String,
    station: String,
    sss: String,
    transmitter: String,
    lon: Number,
    lat: Number,
    unk1: String,
    pmax: Number,
    pmaxdir: String,
    ps: String,
    pi: String,
    pol: String,
    idd: Number,
});

mongoose.model('Userlist', LogSchema);
