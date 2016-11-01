var mongoose = require('mongoose');

var LocationSchema = new mongoose.Schema({
  site: String,
  long: Number,
  lat: Number,
	itu: String,
  country: String,
	qrb: Number
});

mongoose.model('Locat', LocationSchema);
