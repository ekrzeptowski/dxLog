var mongoose = require('mongoose');

var LogSchema = new mongoose.Schema({
  freq: Number,
  pol: String,
  station: String,
	location: {type: mongoose.Schema.Types.ObjectId, ref: 'Locat'},
	ps: String,
	pi: String,
	pmax: Number,
	firstLog: Date,
  mode: String,
	comment: String,
	audio: String
});

mongoose.model('Log', LogSchema);
