var mongoose = require('mongoose');

var LogSchema = new mongoose.Schema({
    ITU: String,
    transmitter: {type: String, unique: true},
    lon: Number,
    lat: Number,
    stations: [{
      freq: Number,
      lang: String,
      station: String,
      modulation: String,
      pmax: Number,
      pmaxdir: String,
      ps: String,
      pi: String,
      pol: String,
      fmscanId: {type: Number, unique: true}
    }]
});

mongoose.model('Userlist', LogSchema);
