var express = require('express');
var config = require('./config');
var path = require('path');
var logger = require('morgan');
var compression = require('compression');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var dotenv = require('dotenv');
var mongoose = require('mongoose');
var jwt = require('jsonwebtoken');
var moment = require('moment');
var request = require('request');
var multer = require('multer');

// Load variables
require('dotenv').config();

// Models
var User = require('./models/User');
require('./models/Logs');
require('./models/Userlist');

// Controllers
var routes = require('./routes/index');
var userController = require('./routes/user');

var app = express();

mongoose.connect(process.env.db);
mongoose.connection.on('error', function() {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
    process.exit(1);
});
app.set('port', config.port);
app.use(compression());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(expressValidator());
app.use(cookieParser());

if (config.expressHttp) {
    app.use('/audio', express.static('audio'));
    if (app.get('env') === 'production') {
        app.use('/', express.static('dist'));
    }
}
if (app.get('env') === 'development') {
    var webpackDevMiddleware = require("webpack-dev-middleware");
    var webpack = require("webpack");
    var webpackConfig = require("./webpack.config");
    var compiler = webpack(webpackConfig);
    app.use(webpackDevMiddleware(compiler, {
        publicPath: "/", // Same as `output.publicPath` in most cases.
        noInfo: false, // display no info to console (only warnings and errors)
        quiet: false
    }));
    app.use(require("webpack-hot-middleware")(compiler));
}
app.set('view engine', 'ejs');

// authentication
app.use(function(req, res, next) {
    req.isAuthenticated = function() {
        var token = (req.headers.authorization && req.headers.authorization.split(' ')[1]) || req.cookies.token;
        try {
            return jwt.verify(token, process.env.TOKEN_SECRET);
        } catch (err) {
            return false;
        }
    };

    if (req.isAuthenticated()) {
        var payload = req.isAuthenticated();
        User.findById(payload.sub, function(err, user) {
            req.user = user;
            next();
        });
    } else {
        next();
    }
});

var audioStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        console.log("Dest");
        cb(null, './audio/');
    },
    filename: function(req, file, cb) {
        cb(null, file.originalname);
    }
});

var userlistStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        console.log("Dest");
        cb(null, './uploads/');
    },
    filename: function(req, file, cb) {
        cb(null, file.originalname);
    }
});

var upload = multer({
    storage: audioStorage
});

app.get('/api/logs', routes.getLogs);
app.get('/api/stats/freq', routes.freqStats);
app.get('/api/stats/itu', routes.ituStats);
app.post('/api/logs', userController.ensureAuthenticated, routes.addLog);
app.put('/api/logs', userController.ensureAuthenticated, routes.updateLog);
app.post('/api/upload', userController.ensureAuthenticated, upload.single('file'), routes.audio);
app.get('/api/userlist/:itu', userController.ensureAuthenticated, routes.userlistQuery);
app.post('/api/userlist', userController.ensureAuthenticated, multer({
    storage: userlistStorage
}).single('csvfile'), routes.userlistUpload);

app.put('/account', userController.ensureAuthenticated, userController.accountPut);
app.delete('/account', userController.ensureAuthenticated, userController.accountDelete);
app.post('/signup', userController.signupPost);
app.post('/login', userController.loginPost);
app.post('/forgot', userController.forgotPost);
app.post('/reset/:token', userController.resetPost);
app.get('/unlink/:provider', userController.ensureAuthenticated, userController.unlink);

app.get('*', function(req, res) {
    res.redirect('/#' + req.originalUrl);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
