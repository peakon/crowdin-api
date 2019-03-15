# Crowdin API

API client for the [Crowdin API](https://support.crowdin.com/api/api-integration-setup/).

## Usage
```
var CrowdinApi = require('crowdin-api');
var api = new CrowdinApi({
  apiKey: 'abcd', // Get this from your project page
  project: 'project-name'
});

api.updateFile(files, ...).then(function(result) {...}).catch(function(err) {...});
```
