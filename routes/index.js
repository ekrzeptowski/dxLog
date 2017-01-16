var mongoose = require('mongoose');
var Log = mongoose.model('Log');

var multer = require('multer');

/* GET home page. */

exports.getLogs = function(req, res, next) {
    Log.find().exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

exports.getAutocomplete = function(req, res, next) {
    Log.aggregate([
      {
        $lookup: {
          from: 'locats',
          localField: 'location',
          foreignField: '_id',
          as: 'locat'
        }},
        {$unwind: '$locat'},
        {
        $group:
        {
          _id: null,
          stations: {
            $addToSet: {name: '$station'}
          },
          transmitters: {
            $addToSet: {site: '$locat.site', long: '$locat.long', lat: '$locat.lat', itu: '$locat.itu', country: '$locat.country', qrb: '$locat.qrb'}
          },
          countries: {
            $addToSet: '$locat.country'
          }
        }
      }
    ]).exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });

}

exports.freqStats = function (req, res, nxt) {
  Log.aggregate([
      {$unwind: '$stations'},
      {
      $group: {
        _id: '$stations.freq',
        count: {$sum: 1}
      }},
      { $sort : { _id : 1 } }
  ]).exec(function(err, log) {
      if (err) {
          return next(err);
      }

      res.send(log);
  });
}

exports.ituStats = function(req, res, next) {
  Log.aggregate([
      {$unwind: '$stations'},
      {$group: {
        _id: '$itu',
        count: {$sum: 1}
      }},
      {$sort: {count: -1}}

  ]).exec(function(err, log) {
      if (err) {
          return next(err);
      }

      res.send(log);
  });
}

exports.addLog = function(req, res, next) {
    var body = Object.assign({}, req.body);
    var input = req.body;

    Log.update({transmitter: req.body.transmitter}, {$set: {transmitter: input.transmitter, itu: input.itu, lat: input.lat, lon: input.lon, qrb: input.qrb}, $push: {stations: input.stations}}, {upsert: true}, function(err, log) {
      res.send("Success");
    });
};

exports.updateLog = function(req, res, next) {
  var data = req.body;
  delete data.__v;
  var station = data.stations;
  delete data.stations;
  Log.findOneAndUpdate(
    { "_id": data._id, "stations._id": station._id },
    {
        "$set": {
            "$": data,
            "stations.$": station
        }
    },
    function(err,doc) {
      res.send("Success");
    }
  );
};

exports.audio = function(req,res){
	console.log(req.body);
	console.log(req.file);
	res.status(204).end();
};
