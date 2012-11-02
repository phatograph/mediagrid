var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
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
    console.log('Getting information of: ' + username)

    var q = 'https://api.twitter.com/1.1/statuses/user_timeline.json?screen_name=' + username + '&count=200&include_rts=false';

    if(max_id) {
      q += '&max_id=' + max_id
    }

    oAuth.get(q, accessToken, accessTokenSecret, function (statuses_error, statuses_data) {
      if (statuses_error) {
        console.log(statuses_error);
      }

      callback(null, statuses_data);
    });
  }
};

// app.get('/', routes.index);
app.get('/users', user.list);

app.get('/test2', function (req, res) {
  get_user_timeline()(function (nothing, statuses_data) {
    res.send(JSON.parse(statuses_data));
  });
});

app.get('/test4', function (req, res) {
  res.render('test4');
});

app.get('/', function (req, res) {
  res.render('test5');
});

app.get('/test3', function (req, res) {
  var count        = 0;
  var threshold    = 30;
  var statuses_old = ['dummy'];
  var statuses_new = [];
  var last_id      = '';

  async.parallel({
    statuses: function (flow_callback) {
      async.until(
        function () { return (statuses_old.length == statuses_new.length || count == threshold); },
        function (callback) {
          count++;

          get_user_timeline(last_id)(function (nothing, statuses_data) {
            var statuses_data = JSON.parse(statuses_data);

            statuses_old = statuses_new;
            statuses_new = statuses_new.concat(statuses_data)
            last_id      = statuses_data[statuses_data.length - 1].id

            console.log(statuses_new.length);

            callback();
          });
        },
        function (err) {
          flow_callback(null, statuses_new);
        }
      );
    },
    limit: function (flow_callback) {
      oAuth.get('https://api.twitter.com/1.1/application/rate_limit_status.json?',
        accessToken, accessTokenSecret, function (limit_error, limit_data) {
          if (limit_error) {
            console.log(limit_error);
          }

          flow_callback(null, limit_data);
        });
    }
  }, function (err, results){
    var statuses = results.statuses;

    res.render('test', {
      statuses_data: statuses,
      limit_statuses_data: JSON.parse(results.limit).resources.statuses,
      last_id: statuses[statuses.length - 1].id
    });
  });
});

app.get('/user/:max_id?', function (req, res) {
  async.parallel({
    statuses: get_user_timeline(req.params.max_id),
    limit: function (callback) {
      oAuth.get('https://api.twitter.com/1.1/application/rate_limit_status.json?',
        accessToken, accessTokenSecret, function (limit_error, limit_data) {
          if (limit_error) {
            console.log(limit_error);
          }

          callback(null, limit_data);
        });
    }
  }, function (err, results){
    var statuses = JSON.parse(results.statuses);

    res.render('test', {
      statuses_data: statuses,
      limit_statuses_data: JSON.parse(results.limit).resources.statuses,
      last_id: statuses[statuses.length - 1].id
    });
  });
});

// http.createServer(app).listen(app.get('port'), function(){
//   console.log("Express server listening on port " + app.get('port'));
// });

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
  io.set('transports', ['xhr-polling']);     // https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
  io.set('polling duration', 10);            // https://devcenter.heroku.com/articles/using-socket-io-with-node-js-on-heroku
});

io.sockets.on('connection', function (socket) {
  //socket.emit('news', 'a');
  socket.on('news0', function (data) {
    console.log('new0');
    io.sockets.emit('news1', 'a');
  });
  socket.on('news2', function (data, fn) {
    console.log('news2');
    io.sockets.emit('news3', 'a');
  });

  socket.on('data1', function (options) {
    var count          = 0;
    var threshold      = 50;
    var statuses_count = 1; // make it not 0 at first place
    var last_id        = '';

    socket.join(options.room); // private room for each user

    oAuth.get('https://api.twitter.com/1.1/users/show.json?include_entities=false&screen_name=' + options.username,
      accessToken, accessTokenSecret, function (user_err, user_data) {

        if (user_err) {
          io.sockets.in(options.room).emit('user_error', JSON.parse(user_err.data).errors[0].message);
        }
        else {
          async.until(
            function () { return (statuses_count == 0 || count == threshold); },
            function (callback) {
              count++;

              get_user_timeline(options.username, last_id)(function (nothing, statuses_data) {
                var statuses_data = JSON.parse(statuses_data);

                statuses_count = statuses_data.length;
                last_id        = statuses_data[statuses_data.length - 1].id

                io.sockets.in(options.room).emit('processing', Math.round(count / threshold * 100));
                io.sockets.in(options.room).emit('data1_res', statuses_data);

                callback();
              });
            },
            function (err) {
              io.sockets.in(options.room).emit('finished');
            }
          );
        }

      });
  });
});