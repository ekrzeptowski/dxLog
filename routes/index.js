var mongoose = require('mongoose');
var Log = mongoose.model('Log');
var Locat = mongoose.model('Locat');

var multer = require('multer');

/* GET home page. */

exports.getLogs = function(req, res, next) {
    Log.find().sort({freq: 1}).populate('location').exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

exports.getCountry = function(req, res, next) {
    Log.aggregate([
      {
        $lookup: {
          from: 'locats',
          localField: 'location',
          foreignField: '_id',
          as: 'location'
        }
      },
      {$unwind: '$location'},
      {$match: {'location.itu': req.params.itu}},
			{$sort: {'freq': 1}}
    ]).exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

exports.getStation = function(req, res, next) {
    Log.find({
        'station': req.params.station
    }).sort({freq: 1}).populate('location').exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

exports.getTransmiter = function(req, res, next) {
    Log.find({
        'location': req.params.loc
    }).sort({freq: 1}).populate('location').exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

exports.getAutocomplete = function(req, res, next) {
  /*if(req.params.type == "station"){
    Log.aggregate([
      { $group: {
        _id: null,
        stations: {$addToSet: {station: '$station'}}

      }}
    ]).exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
  }
  else if(req.params.type == "location"){*/
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
    {
      $group: {
        _id: '$freq',
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
    {
      $lookup: {
        from: 'locats',
        localField: 'location',
        foreignField: '_id',
        as: 'locat'
      }},
      {$unwind: '$locat'},
      {$group: {
        _id: '$locat.itu',
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
    var loc = req.body.location;

    function newLog() {
        console.log(req.body);
        var log = new Log(req.body);
        log.save(function(err, log){
          if(err){ return next(err); }
        });
    }
    Locat.count({
        "site": loc.site
    }, function(err, count) {
        function getId() {
            Locat.findOne({
                "site": loc.site
            }, function(err, locid) {
                req.body.location = locid._id;
                newLog();
            });
        }
        if (err) {
            res.send("Nie");
            return next(err);
        }
        if (count == 1) {
            getId();
        } else if (count < 1) {
            var locat = new Locat(loc);
            locat.save(function(err, locat) {
                if (err) {
                    return next(err);
                }
                getId();
            });
        }
    });
    res.send("Dodano");
};

exports.updateLog = function(req, res, next) {
  var data = req.body;
  delete data.__v;
  delete data.location.__v;
  Locat.findByIdAndUpdate(data.location._id, data.location, {}, function(err, locat) {
      if (err) {
          return next(err);
      }
      data.location = locat._id;
      Log.findByIdAndUpdate(data._id, data, {} ,function(err, locat) {
          if (err) {
              return next(err);
          }
          else {
            res.send("Succes");
          }
      });
  });
};

exports.audio = function(req,res){
	console.log(req.body);
	console.log(req.file);
	res.status(204).end();
};
