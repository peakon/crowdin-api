# Crowdin API

[![Greenkeeper badge](https://badges.greenkeeper.io/peakon/crowdin-api.svg)](https://greenkeeper.io/)

API client for the [Crowdin API](https://crowdin.com/page/api).

## Usage
```
var api = require('crowdin-api');
api.setKey('abcd') //Get this from your project page

api.uploadFile('project-name', ...).then(function(result) {...}).catch(function(err) {...});
```