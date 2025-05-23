var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var jwt = require('jsonwebtoken');
var moment = require('moment');
var request = require('request');
var qs = require('querystring');
var User = require('../models/User');

function generateToken(user) {
    var payload = {
        iss: process.env.TOKEN_ISSUER,
        sub: user.id,
        iat: moment().unix(),
        exp: moment().add(7, 'days').unix()
    };
    return jwt.sign(payload, process.env.TOKEN_SECRET);
}

/**
 * Login required middleware
 */
exports.ensureAuthenticated = function(req, res, next) {
    if (req.isAuthenticated()) {
        next();
    } else {
        res.status(401).send({
            msg: 'Unauthorized'
        });
    }
};
/**
 * POST /login
 * Sign in with email and password
 */
exports.loginPost = function(req, res, next) {
    req.assert('email', 'Email is not valid').isEmail();
    req.assert('email', 'Email cannot be blank').notEmpty();
    req.assert('password', 'Password cannot be blank').notEmpty();
    req.sanitize('email').normalizeEmail({
        remove_dots: false
    });

    var errors = req.validationErrors();

    if (errors) {
        return res.status(400).send(errors);
    }

    User.findOne({
        email: req.body.email
    }, function(err, user) {
        if (!user) {
            return res.status(401).send({
                msg: 'The email address ' + req.body.email + ' is not associated with any account. ' +
                    'Double-check your email address and try again.'
            });
        }
        user.comparePassword(req.body.password, function(err, isMatch) {
            if (!isMatch) {
                return res.status(401).send({
                    msg: 'Invalid email or password'
                });
            }
            res.send({
                token: generateToken(user),
                user: user.toJSON()
            });
        });
    });
};

/**
 * POST /signup
 */
exports.signupPost = function(req, res, next) {
    req.assert('name', 'Name cannot be blank').notEmpty();
    req.assert('email', 'Email is not valid').isEmail();
    req.assert('email', 'Email cannot be blank').notEmpty();
    req.assert('password', 'Password must be at least 4 characters long').len(4);
    req.sanitize('email').normalizeEmail({
        remove_dots: false
    });

    var errors = req.validationErrors();

    if (errors) {
        return res.status(400).send(errors);
    }

    User.find({}, function(error, result) {
        if (!result) {
            User.findOne({
                email: req.body.email
            }, function(err, user) {
                if (user) {
                    return res.status(400).send({
                        msg: 'The email address you have entered is already associated with another account.'
                    });
                }
                user = new User({
                    name: req.body.name,
                    email: req.body.email,
                    password: req.body.password
                });
                user.save(function(err) {
                    res.send({
                        token: generateToken(user),
                        user: user
                    });
                });
            });
        } else {
					return res.status(403).send({
							msg: 'Error! Registration is disabled.'
					});
				}
    });

};


/**
 * PUT /account
 * Update profile information OR change password.
 */
exports.accountPut = function(req, res, next) {
    if ('password' in req.body) {
        req.assert('password', 'Password must be at least 4 characters long').len(4);
        req.assert('confirm', 'Passwords must match').equals(req.body.password);
    } else {
        req.assert('email', 'Email is not valid').isEmail();
        req.assert('email', 'Email cannot be blank').notEmpty();
        req.sanitize('email').normalizeEmail({
            remove_dots: false
        });
    }

    var errors = req.validationErrors();

    if (errors) {
        return res.status(400).send(errors);
    }

    User.findById(req.user.id, function(err, user) {
        if ('password' in req.body) {
            user.password = req.body.password;
        } else {
            user.email = req.body.email;
            user.name = req.body.name;
            user.gender = req.body.gender;
            user.location = req.body.location;
            user.website = req.body.website;
            user.userlistUpdated = req.body.userlistUpdated;
        }
        user.save(function(err) {
            if ('password' in req.body) {
                res.send({
                    msg: 'Your password has been changed.'
                });
            } else if (err && err.code === 11000) {
                res.status(409).send({
                    msg: 'The email address you have entered is already associated with another account.'
                });
            } else {
                res.send({
                    user: user,
                    msg: 'Your profile information has been updated.'
                });
            }
        });
    });
};

/**
 * DELETE /account
 */
exports.accountDelete = function(req, res, next) {
    User.remove({
        _id: req.user.id
    }, function(err) {
        res.send({
            msg: 'Your account has been permanently deleted.'
        });
    });
};

/**
 * GET /unlink/:provider
 */
exports.unlink = function(req, res, next) {
    User.findById(req.user.id, function(err, user) {
        switch (req.params.provider) {
            case 'facebook':
                user.facebook = undefined;
                break;
            case 'google':
                user.google = undefined;
                break;
            case 'twitter':
                user.twitter = undefined;
                break;
            case 'vk':
                user.vk = undefined;
                break;
            case 'github':
                user.github = undefined;
                break;
            default:
                return res.status(400).send({
                    msg: 'Invalid OAuth Provider'
                });
        }
        user.save(function(err) {
            res.send({
                msg: 'Your account has been unlinked.'
            });
        });
    });
};

/**
 * POST /forgot
 */
exports.forgotPost = function(req, res, next) {
    req.assert('email', 'Email is not valid').isEmail();
    req.assert('email', 'Email cannot be blank').notEmpty();
    req.sanitize('email').normalizeEmail({
        remove_dots: false
    });

    var errors = req.validationErrors();

    if (errors) {
        return res.status(400).send(errors);
    }

    async.waterfall([
        function(done) {
            crypto.randomBytes(16, function(err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function(token, done) {
            User.findOne({
                email: req.body.email
            }, function(err, user) {
                if (!user) {
                    return res.status(400).send({
                        msg: 'The email address ' + req.body.email + ' is not associated with any account.'
                    });
                }
                user.passwordResetToken = token;
                user.passwordResetExpires = Date.now() + 3600000; // expire in 1 hour
                user.save(function(err) {
                    done(err, token, user);
                });
            });
        },
        function(token, user, done) {
            var transporter = nodemailer.createTransport({
                service: 'Mailgun',
                auth: {
                    user: process.env.MAILGUN_USERNAME,
                    pass: process.env.MAILGUN_PASSWORD
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'support@yourdomain.com',
                subject: '✔ Reset your password on Mega Boilerplate',
                text: 'You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            transporter.sendMail(mailOptions, function(err) {
                res.send({
                    msg: 'An email has been sent to ' + user.email + ' with further instructions.'
                });
                done(err);
            });
        }
    ]);
};

/**
 * POST /reset
 */
exports.resetPost = function(req, res, next) {
    req.assert('password', 'Password must be at least 4 characters long').len(4);
    req.assert('confirm', 'Passwords must match').equals(req.body.password);

    var errors = req.validationErrors();

    if (errors) {
        return res.status(400).send(errors);
    }

    async.waterfall([
        function(done) {
            User.findOne({
                    passwordResetToken: req.params.token
                })
                .where('passwordResetExpires').gt(Date.now())
                .exec(function(err, user) {
                    if (!user) {
                        return res.status(400).send({
                            msg: 'Password reset token is invalid or has expired.'
                        });
                    }
                    user.password = req.body.password;
                    user.passwordResetToken = undefined;
                    user.passwordResetExpires = undefined;
                    user.save(function(err) {
                        done(err, user);
                    });
                });
        },
        function(user, done) {
            var transporter = nodemailer.createTransport({
                service: 'Mailgun',
                auth: {
                    user: process.env.MAILGUN_USERNAME,
                    pass: process.env.MAILGUN_PASSWORD
                }
            });
            var mailOptions = {
                from: 'support@yourdomain.com',
                to: user.email,
                subject: 'Your Mega Boilerplate password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            transporter.sendMail(mailOptions, function(err) {
                res.send({
                    msg: 'Your password has been changed successfully.'
                });
            });
        }
    ]);
};
