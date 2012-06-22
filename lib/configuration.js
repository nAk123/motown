/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * An abstraction which contains various pre-set deployment
 * environments and adjusts runtime configuration appropriate for
 * the current environmnet (specified via the NODE_ENV env var)..
 * Borrowed from the browserid project. -- Thanks @lloyd.
 * (https://github.com/mozilla/browserid)
 *
 * usage is
 *   exports.configure(app);
 */

const
path = require('path'),
semver = require('semver'),
fs = require('fs'),
convict = require('convict'),
cjson = require('cjson');

process.env.APP_ROOT = path.join(path.dirname(module.filename), '..');

// verify the proper version of node.js is in use
try {
  var required = 'unknown';
  // extract required node version from package.json
  required = JSON.parse(fs.readFileSync(path.join(__dirname, '..', "package.json"))).engines.node;
  if (!semver.satisfies(process.version, required)) throw false;
} catch (e) {
  process.stderr.write("update node! verision " + process.version +
                       " is not " + required +
                       (e ? " (" + e + ")" : "") + "\n");
  process.exit(1);
}

var conf = module.exports = convict({
  env: {
    doc: "What environment are we running in?  Note: all hosted environments are 'production'.  ",
    //TODO: Perhaps unrestrict environment names.
    format: 'string ["production", "test", "development"] = "production"',
    env: 'NODE_ENV'
  },
  irc: {
    server: {
      doc: "The host name of the server we're connecting to",
      format: 'string = "irc.mozilla.org"',
      env: 'IRC_HOST'
    },
    nick: {
      doc: "The nick for the daemon to use",
      format: 'string = "motown"',
      env: 'IRC_NICK'
    },
    retryDelay: {
      doc: "The delay between connection attempts by the IRC Bot.",
      format: 'integer{100,10000} = 2000'
    }
  },
  logger: {
    level: {
      doc: "The log level",
      format: 'string ["silent", "win", "error", "warn", "http", "info", "verbose", "silly"] = "info"',
      env: 'LOG_LEVEL'
    }
  },
  redis: {
    ignore_vcap_service_creds: {
      doc: "Ignore creds discovered via VCAP_SERVICES environment variable",
      format: 'boolean = false',
      env: 'REDIS_IGNORE_VCAP_SERVICES'
    },
    host: {
      doc: "The host where redis is listening",
      format: 'string = "localhost"',
      env: 'REDIS_HOST'
    },
    port: {
      doc: "The port that redis is listening on",
      format: 'integer{1,65535} = 6379',
      env: 'REDIS_PORT'
    },
    password: {
      doc: "The password for redis if applicable",
      format: 'string?',
      env: 'REDIS_PASSWORD'
    }
  },
  mysql: {
    user: {
      doc: "The MySQL username to connect with",
      format: 'string',
      env: 'MYSQL_USER'
    },
    password: {
      doc: "The MySQL password",
      format: 'string',
      env: 'MYSQL_PASSWORD'
    },
    database: {
      doc: "The MySQL database to connect to",
      format: 'string = "motown"',
      env: 'MYSQL_DATABASE'
    }
  },
  bind_to: {
    host: {
      doc: "The ip address the HTTP server should bind to",
      format: 'string = "127.0.0.1"',
      env: 'IP_ADDRESS'
    },
    port: {
      doc: "The port the HTTP server should bind to",
      format: 'integer{1,65535}?',
      env: 'PORT'
    }
  },
  public_url: {
    doc: "The publically visible URL of the deployment",
    format: 'string = "http://motown.mozillalabs.com"',
    env: 'URL'
  },
  public_ws_url: {
    doc: "The publically available URL for WebSockets",
    format: 'string = "ws://motown.mozillalabs.com"',
    env: 'WS_URL'
  },
  social_provider: {
    name_suffix: {
      doc: "The suffix to add on to the name you see in /social_provider/manifest.json",
      format: 'string = ""'
    }
  }
});


console.log("Initializing MoTown. Environment: " + conf.get('env'));

// Here we set NODE_ENV in case we're defaulting to prod. 
// If NODE_ENV is already set, it'll be the same as conf.get('env')
process.env.NODE_ENV = conf.get('env');

// Here we load config/base.json and then overlay config/environments/{{NODE_ENV}}.json
conf.load(cjson.load(path.join(__dirname, '..', 'config', 'base.json')));
conf.load(cjson.load(path.join(__dirname, '..', 'config', 'environments', conf.get('env') + '.json')));

try{
  // validate the configuration based on the above specification
  conf.validate();
} catch(ex){
  console.log("\nError validating configuration! \n\tSee " + __filename + ". \n\tError: " + ex);
  process.exit();
}

// Replace any settings with those discovered in VCAP_SERVICES 
if (process.env.VCAP_SERVICES){
  var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
  
  conf.load({
    bind_to: {
      port: process.env.VCAP_APP_PORT
    }
  });
  
  // Ignore if set.
  if (!conf.get('redis')['ignore_vcap_service_creds']) {
    // TODO: have it look for /^redis/ to grab the config info
    var redisConfig = vcapServices['redis-2.2'][0];
    conf.load({
      redis: {
        host: redisConfig.credentials.hostname,
        port: redisConfig.credentials.port,
        password: redisConfig.credentials.password
      }
    });
  }
}

