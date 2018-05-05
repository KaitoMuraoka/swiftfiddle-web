'use strict';

const BodyParser = require('body-parser');
const Compression = require('compression');
const Express = require("express");

const app = Express();

function random(size) {
  return require("crypto").randomBytes(size).toString('hex');
}

function availableVersions() {
  const result = require('child_process').execSync('docker images kishikawakatsumi/swift --format "{{.Tag}}"').toString();
  return result.split('\n').sort();
}

function latestVersion() {
  const versions = availableVersions();
  return versions[versions.length - 1];
}

function stableVersion() {
  return '4.1';
}

app.use(Compression())
app.use(Express.static(__dirname + '/static'));
app.use(BodyParser.urlencoded({ extended: false }));
app.use(BodyParser.json());

app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/', function(req, res) {
  res.sendfile("./index.html");
});

app.get('/versions', function(req, res) {
  res.send({ versions: availableVersions() });
});

app.post('/run', function(req, res) {
  const path = require('path');
  const Sandbox = require('./sandbox');

  const root_dir = __dirname;
  const temp_dir = path.join('temp', random(10));
  const filename = 'main.swift';

  let toolchain_version = req.body.toolchain_version || stableVersion();
  if (toolchain_version == 'latest') {
    toolchain_version = latestVersion();
  } else if (toolchain_version == 'stable') {
    toolchain_version = stableVersion();
  }
  const command = req.body.command || 'swift';
  const options = req.body.options || '';
  const code = req.body.code;
  let timeout = req.body.timeout || 30;

  if (!availableVersions().includes(toolchain_version.toString())) {
    const error = `Swift '${toolchain_version}' toolchain is not supported.`;
    res.send({ output: '', errors: error, version: '' });
    return;
  }

  if (!['swift', 'swiftc'].includes(command)) {
    const error = `Command '${command}' is not supported.`;
    res.send({ output: '', errors: error, version: '' });
    return;
  }

  const commandInjectionOperators = [';', '&', '&&', '||', '`', '(', ')', '#'];
  if (commandInjectionOperators.some(operator => options.includes(operator))) {
    const error = 'Invalid control characters found';
    res.send({ output: '', errors: error, version: '' });
    return;
  }

  if (!code) {
    const error = `No code to run.`;
    res.send({ output: '', errors: error, version: '' });
    return;
  }

  timeout = parseInt(timeout);
  const maxTimeout = 600;
  if (isNaN(timeout)) {
    timeout = defaultTimeout;
  } else if (timeout > maxTimeout) {
    timeout = maxTimeout;
  }

  const sandbox = new Sandbox(root_dir, temp_dir, filename, toolchain_version, command, options, code, timeout);
  sandbox.run(function(data, error, version) {
    res.send({ output: data, errors: error, version: version });
  });
});

var server = require("http").createServer(app);
server.listen(8080, function() {
  console.log("Playground app listening on port " + server.address().port);
});
