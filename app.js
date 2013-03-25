var express = require('express')
  , http = require('http')
  , path = require('path')
  , async = require('async');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(require('stylus').middleware(__dirname + '/public'));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

var OAuth = require('oauth').OAuth;
var oAuth = new OAuth("http://twitter.com/oauth/request_token",
               "http://twitter.com/oauth/access_token",
               'tUvYUVOMk8EyLD64DmlYw',
               'dwcUJ2q4k47QoNGPlnCknzYAnoEKcoSxha3kFx588',
               "1.0A",
               null,
               "HMAC-SHA1");

var accessToken = '47032387-JVPDHcu1QrWUhNdExVL4rLf7cRvsxAfzIgwAugM';
var accessTokenSecret = 'sgEmsqb7YxLTMujSv3wvvOcalyyhahuEQeHvBuuu8';

var get_user_timeline = function (username, max_id, callback) {
  return function (callback) {
    console.log('Getting information of: ' + username + ', max id: ' + max_id);

    var q = 'https://api.twitter.com/1.1/statuses/user_timeline.json?screen_name=' + username + '&count=200&include_rts=false';

    if(max_id) {
      q += '&max_id=' + max_id
    }

    oAuth.get(q, accessToken, accessTokenSecret, function (statuses_error, statuses_data) {
      if (statuses_error) {
        console.log('###################################');
        console.log('ERROR: get_user_timeline ');
        console.log(statuses_error);
        console.log('###################################');
        callback(null, statuses_error);
      }
      else {
        callback(null, JSON.parse(statuses_data));
      }
    });
  }
};

app.get('/:user_id?', function (req, res) {
  res.render('index', {
    user_id: req.params.user_id
  });
});

var server = http.createServer(app);
var io = require('socket.io').listen(server);

server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

io.configure(function () {
  io.set('log level', 2);                    // reduce logging
});
io.configure('production', function(){
  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
  // io.set('transports', ['xhr-polling']);     // https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
  // io.set('polling duration', 10);            // https://devcenter.heroku.com/articles/using-socket-io-with-node-js-on-heroku
});

io.sockets.on('connection', function (socket) {
  socket.on('data1', function (options) {
    var count          = 0;
    var threshold      = 20;
    var statuses_count = 2; // make it more than 1 at first place
    var last_id        = '';
    var tweet_count    = 0;
    var user_err_msg;

    socket.join(options.room); // private room for each user

    oAuth.get('https://api.twitter.com/1.1/users/show.json?include_entities=false&screen_name=' + options.username,
      accessToken, accessTokenSecret, function (user_err, user_data) {

        if (user_err) {
          console.log('###################################');
          console.log('ERROR: api.twitter.com/1.1/users/show.json ');
          console.log(user_err);
          console.log('###################################');

          user_err_msg = JSON.parse(user_err.data).errors ? JSON.parse(user_err.data).errors[0].message : JSON.parse(user_err.data).error;
          io.sockets.in(options.room).emit('user_error', user_err_msg);
        }
        else {
          async.until(
            function () { return (statuses_count <= 1 || count == threshold); },
            function (callback) {
              count++;

              get_user_timeline(options.username, last_id)(function (nothing, statuses_data) {
                if (statuses_data.statusCode) {
                  console.log('###################################');
                  console.log('ERROR: api.twitter.com/1.1/users/show.json ');
                  console.log(statuses_data);
                  console.log('###################################');

                  user_err_msg = JSON.parse(statuses_data.data).errors ? JSON.parse(statuses_data.data).errors[0].message : JSON.parse(statuses_data.data).error;
                  io.sockets.in(options.room).emit('user_error', user_err_msg);
                  statuses_count = 0;
                }
                else {
                  statuses_count = statuses_data.length;
                  tweet_count += statuses_count;

                  if(statuses_data.length > 0) {
                    last_id = statuses_data[statuses_data.length - 1].id
                  }
                  else {
                    last_id = '';
                  }

                  io.sockets.in(options.room).emit('processing', {
                    tweet_count: tweet_count,
                    percentage: Math.round(count / threshold * 100)
                  });
                  io.sockets.in(options.room).emit('data1_res', statuses_data);
                }

                callback();
              });
            },
            function (err) {
              console.log('Finish: ' + options.username);
              io.sockets.in(options.room).emit('finished');
            }
          );
        }

      });
  });
});