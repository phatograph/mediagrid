
/**
 * Module dependencies.
 */

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

var get_user_timeline = function (max_id, callback) {
  return function (callback) {
    var q = 'https://api.twitter.com/1.1/statuses/user_timeline.json?screen_name=phatograph&count=200&include_rts=false';

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

app.get('/', routes.index);
app.get('/users', user.list);
app.get('/test2', function (req, res) {
  get_user_timeline(function (nothing, statuses_data) {
    res.send(JSON.parse(statuses_data));
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

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
