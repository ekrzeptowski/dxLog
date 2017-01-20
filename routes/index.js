var mongoose = require('mongoose');
var Log = mongoose.model('Log');
var Userlist = mongoose.model('Userlist');

var multer = require('multer');
var fs = require('fs');
var parse = require('csv-parse');
var striplines = require('striplines');
var iconv = require('iconv-lite');


/* GET home page. */

exports.getLogs = function(req, res, next) {
    Log.find().exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
};

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

exports.userlistQuery = function (req, res, next) {
  if (req.params.itu == "itus") {
    Userlist.aggregate([
        {$group: {
          _id: '$ITU'
        }},
        {$sort: {_id: 1}}
    ]).exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
  } else {
    Userlist.find({
        'ITU': req.params.itu
    }).exec(function(err, log) {
        if (err) {
            return next(err);
        }

        res.send(log);
    });
  }
};

exports.userlistUpload = function(req, res, next) {
    function parseCSVFile(sourceFilePath, columns, onNewRecord, handleError, done) {
        var source = fs.createReadStream(sourceFilePath);

        var linesRead = 0;

        var parser = parse({
            delimiter: '\t',
            columns: columns,
            auto_parse: true,
            relax_column_count: true
        });

        parser.on("data", function(ul) {
            // Skip last line
            if (ul.freq == "108999        0000-0001       XXX fmscan.org list end      XXX XXX\n"){
              return "done";
            }
            var garbage = ["unk1", "unk2", "unk3", "unk4", "unk5"]; // Unnecesary data array
            for (let i = 0; i < garbage.length; i++) {
              delete ul[garbage[i]];
            }
            ul.freq /= 1000;
            // Replace HTML charcodes to characters and clean strings
            ul.station = ul.station.replace(/&#(\d+);/g, function(match, match2) {
              return String.fromCharCode(+match2);
            });
            ul.transmitter = ul.transmitter.replace(/&#(\d+);/g, function(match, match2) {
              return String.fromCharCode(+match2);
            }).replace(/([/])/g, " - ").replace(/(\s*\(\d*\w*\))/g, "");
            // Clone station array
            var stations = JSON.parse(JSON.stringify(ul));
            var stationsGarbage = ["ITU", "transmitter", "lat", "lon"]; // Remove transmitter data from station array
            for (let i = 0; i < stationsGarbage.length; i++) {
              delete stations[stationsGarbage[i]];
            }
            // Remove station data from transmitter array
            var transGarbage = ["freq", "lang", "station", "modulation", "pmax", "pmaxdir", "ps", "pi", "pol", "fmscanId"];
            for (let i = 0; i < transGarbage.length; i++) {
              delete ul[transGarbage[i]];
            }
            Userlist.update({transmitter: ul.transmitter}, {$set: ul, $push: {stations: stations}}, {upsert: true}, function(err, log) {
                if (err) {
                    return next(err);
                }
            });
            linesRead++;
        });

        parser.on("error", function(error) {
            handleError(error);
        });

        parser.on("end", function() {
            done(linesRead);
        });

        source.pipe(iconv.decodeStream('win1252'))
            .pipe(iconv.encodeStream('utf8'))
            .pipe(striplines(9))
            .pipe(parser);
    }

    var filePath = req.file.path;
    console.log(filePath);

    function onNewRecord(record) {}

    function onError(error) {
        console.log(error);
    }

    function done(linesRead) {
        res.send(200, "Added " + linesRead + " stations");
    }
    Userlist.remove().exec(function(err, log) {
        if (err) {
            return next(err);
        }

    });
    // Columns in csv file
    var columns = ["freq", "ITU", "lang", "station", "modulation", "transmitter", "lat", "lon", "unk1", "pmax", "pmaxdir", "unk2", "unk3", "unk4", "ps", "pi", "pol", "fmscanId"];
    parseCSVFile(filePath, columns, onNewRecord, onError, done);
};
