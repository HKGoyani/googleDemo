var http = require('http');
var express = require('express');
var Session = require('express-session');
var {google} = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var plus = google.plus('v1');
var bodyParser = require('body-parser');
var config = require('./config.json');

var MongoClient = require('mongodb').MongoClient;
var url = config.DatabaseUrl;
var dbName = config.DatabaseName;
 
MongoClient.connect(url, function(err, client) {
    db = client.db(dbName);
    console.log("Database connected...");
});

var app = express();

app.use(express.static('./views'));
app.engine('.html', require('ejs').__express);
app.set('view engine', 'html');
app.set('views', './views');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
 
var port = 4000;
var server = http.createServer(app);
server.listen(port);
server.on('listening', function () {
    console.log(`listening to ${port}`);
});
 
//using session in express
app.use(Session({
    secret: 'secret-19890913007',
    resave: true,
    saveUninitialized: true
}));
 
//this is the base route
app.get("/", function (req, res) {
    res.render('index',{url: url});
});

app.get("/login", function (req, res) {
    var url = getAuthUrl();
    res.send({url:url})
});
app.get("/register", function (req, res) {
    res.render('register')
});
app.get("/oauthCallback", function (req, res) {
    // console.log("in oauthCallback ",req.session);
    
    var oauth2Client = getOAuthClient();
    var session = req.session;
    var code = req.query.code; // the query param code
    oauth2Client.getToken(code, function(err, tokens) {
      // Now tokens contains an access_token and an optional refresh_token. Save them.
        console.log('err >> oauth > ',err,tokens)
        if(!err) {
            oauth2Client.setCredentials(tokens);
            //saving the token to current session
            session["tokens"]=tokens;
            var gmail = google.gmail({
                    auth: oauth2Client,
                    version: 'v1'
            });
            
            gmail.users.getProfile({ auth: oauth2Client, userId: 'me' }, function(err, resp) {
                if (!err) {
                    console.log(resp.data);
                    if(resp.data) {
                        var useremail = resp.data.emailAddress;
                        db.collection('users').find({email:useremail}).toArray(function(errdata,udata){
                            if(!err && udata.length > 0) {
                                var updt = {
                                    $set: {
                                        access_token: tokens.access_token,
                                        scope: tokens.scope,
                                        id_token: tokens.id_token
                                    }
                                }
                                db.collection('users').update({email:useremail},updt,function(errup,dtup){
                                    if(!err && dtup.result.n) {
                                        console.log('data updated ')
                                        var sendData = {
                                            email: useremail,
                                            access_token: tokens.access_token,
                                            scope: tokens.scope,
                                            id_token: tokens.id_token
                                        }
                                        res.render('register',sendData);
                                    }
                                })
                            }
                            else {
                                console.log('user not found');
                                var insertData = {
                                    email: useremail,
                                    access_token: tokens.access_token,
                                    scope: tokens.scope,
                                    id_token: tokens.id_token
                                }
                                db.collection('users').insertOne(insertData,function(errin,resp){
                                    console.log('data inserted...');
                                    var sendData = {
                                        email: useremail,
                                        access_token: tokens.access_token,
                                        scope: tokens.scope,
                                        id_token: tokens.id_token
                                    }
                                    res.render('register',sendData);
                                })
                            }
                        })
                    }
                } else {
                    console.log('err in get profile data > ',err);
                }
            });
        }
        else {
            res.send(`
                <h3>Login failed!!</h3>
            `);
        }
    });
});

app.post('/register',function(req,res){
    var oauth2Client = getOAuthClient();
    var session = req.session;

    console.log(req.body);
    var data = req.body;
    var insertData = {
        name: data.name,
        email: data.email,
        phoneno: data.phno,
        address: data.address,
        skills: data.skills
    }
    db.collection('register').insert(insertData,function (err, resp) {
        if(!err) {
            console.log('data registered.');
            res.send({done:true});
        }
    })
})

app.get('/finale', (req, res) => {
    res.render('finale');
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});

function getOAuthClient () {
    return new OAuth2(config.ClientId ,  config.ClientSecret, config.RedirectionUrl);
}
 
function getAuthUrl () {
    var oauth2Client = getOAuthClient();
    var scopes = [
      'https://www.googleapis.com/auth/plus.me',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ];
 
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    return url;
}