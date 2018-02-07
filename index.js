'use strict';

const fs = require('fs');
const path = require('path');
const request = require('request-promise-native');

let apiKey;
let baseUrl = 'https://api.crowdin.com';

function validateKey() {
  if (apiKey === undefined) {
    throw new Error('Please specify CrowdIn API key.');
  }
}

function throwError(result) {
  throw new Error('Error code ' + result.error.code + ': ' + result.error.message);
}

function handleRequest(request) {
  return request
    .then(function (body) {
      const result = JSON.parse(body);
      if (result.success === false) {
        throwError(result);
      }

      return result;
    })
    .catch(function (err) {
      if (err.response && err.response.body) {
        try {
          var parsed = JSON.parse(err.response.body);
          throwError(parsed);
        } catch (parseErr) {
          throw err;
        }
      }

      throw err;
    });
}

function getApiCall(apiUrl) {
  validateKey();

  var url = baseUrl + '/api/' + apiUrl;
  var params = {
    json: true,
    key: apiKey
  };

  return handleRequest(request.get({
    url: url,
    qs: params
  }));
}

function postApiCall(apiUrl, getOptions, postOptions) {
  validateKey();

  var url = baseUrl + '/api/' + apiUrl;
  var params = Object.assign(getOptions || {}, {
    json: true,
    key: apiKey
  });

  return handleRequest(request.post({
    url: url,
    qs: params,
    formData: postOptions
  }));
}

function getApiRequest(apiUrl) {
  validateKey();

  var url = baseUrl + '/api/' + apiUrl + '?key=' + apiKey + '&json';

  return request(url);
}

module.exports = {
  setBasePath: function (newBasePath) {
    baseUrl = newBasePath;
  },

  setKey: function (newKey) {
    apiKey = newKey;
  },
  /**
   * Add new file to Crowdin project
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Files array that should be added to Crowdin project.
   *   Array keys should contain file names with path in Crowdin project.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param params {Object} Information about uploaded files.
   */
  addFile: function (projectName, files, params, folder, downloadPath) {
    let filesInformation = {};

    files.forEach(function (fileName) {
      let folderName = folder || '';
      let folderFileName = path.join(folderName, fileName);
      let files = `files[${folderFileName}]`;
      let patterns = `export_patterns[${folderFileName}]`;

      filesInformation[files] = fs.createReadStream(fileName);
      filesInformation[patterns] = path.join('/', folderName, downloadPath, '/%locale%.%file_extension%');
    });

    return postApiCall('project/' + projectName + '/add-file', undefined, Object.assign(filesInformation, params));
  },
  /**
   * Upload latest version of your localization file to Crowdin.
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Files array that should be updated.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param params {Object} Information about updated files.
   */
  updateFile: function (projectName, files, params, folder) {
    var filesInformation = {};

    files.forEach(function (fileName) {
      let folderName = (folder) ? `${folder}/` : '';
      let index = `files[${folderName}${fileName}]`;
      filesInformation[index] = fs.createReadStream(fileName);
    });

    return postApiCall('project/' + projectName + '/update-file', undefined, Object.assign(filesInformation, params));
  },
  /**
   * Delete file from Crowdin project. All the translations will be lost without ability to restore them.
   * @param projectName {String} Should contain the project identifier
   * @param fileName {String} Name of file to delete.
   */
  deleteFile: function (projectName, fileName) {
    return postApiCall('project/' + projectName + '/delete-file', undefined, {
      file: fileName
    });
  },
  /**
   * Upload existing translations to your Crowdin project
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Translated files array. Array keys should contain file names in Crowdin.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param language {String} Target language. With a single call it's possible to upload translations for several files but only into one of the languages
   * @param params {Object} Information about updated files.
   */
  updateTranslations: function (projectName, files, language, params) {
    var filesInformation = {
      language: language
    };

    files.forEach(function (fileName) {
      var index = 'files[' + fileName + ']';
      filesInformation[index] = fs.createReadStream(fileName);
    });

    return postApiCall('project/' + projectName + '/upload-translation', undefined, Object.assign(filesInformation, params));
  },
  /**
   * Track your Crowdin project translation progress by language.
   * @param projectName {String} Should contain the project identifier.  */
  translationStatus: function (projectName) {
    return postApiCall('project/' + projectName + '/status');
  },
  /**
   * Get Crowdin Project details.
   * @param projectName {String} Should contain the project identifier.
   */
  projectInfo: function (projectName) {
    return postApiCall('project/' + projectName + '/info');
  },
  /**
   * Download ZIP file with translations. You can choose the language of translation you need.
   */
  downloadTranslations: function (projectName, languageCode) {
    return getApiRequest('project/' + projectName + '/download/' + languageCode + '.zip');
  },
  /**
   * Download ZIP file with all translations.
   */
  downloadAllTranslations: function (projectName) {
    return getApiRequest('project/' + projectName + '/download/all.zip');
  },
  /**
   * Build ZIP archive with the latest translations. Please note that this method can be invoked only once per 30 minutes (there is no such
   * restriction for organization plans). Also API call will be ignored if there were no changes in the project since previous export.
   * You can see whether ZIP archive with latest translations was actually build by status attribute ('built' or 'skipped') returned in response.
   */
  exportTranslations: function (projectName) {
    return getApiCall('project/' + projectName + '/export');
  },
  /**
   * Edit Crowdin project
   * @param projectName {String} Name of the project to change
   * @param params {Object} New parameters for the project.
   */
  editProject: function (projectName, params) {
    return postApiCall('project/' + projectName + '/edit-project', undefined, params);
  },
  /**
   * Delete Crowdin project with all translations.
   * @param projectName {String} Name of the project to delete.
   */
  deleteProject: function (projectName) {
    return postApiCall('project/' + projectName + '/delete-project');
  },
  /**
   * Add directory to Crowdin project.
   * @param projectName {String} Should contain the project identifier.
   * @param directory {String} Directory name (with path if nested directory should be created).
   */
  createDirectory: function (projectName, directory) {
    return postApiCall('project/' + projectName + '/add-directory', undefined, {
      name: directory
    });
  },
  /**
   * Rename directory or modify its attributes. When renaming directory the path can not be changed (it means new_name parameter can not contain path, name only).
   * @param projectName {String} Full directory path that should be modified (e.g. /MainPage/AboutUs).
   * @param directory {String} New directory name.
   * @param params {Object} New parameters for the directory.
   */
  changeDirectory: function (projectName, directory, params) {
    return postApiCall('project/' + projectName + '/change-directory', undefined, {
      name: directory
    }, params);
  },
  /**
   * Delete Crowdin project directory. All nested files and directories will be deleted too.
   * @param projectName {String} Should contain the project identifier.
   * @param directory {String} Directory path (or just name if the directory is in root).
   */
  deleteDirectory: function (projectName, directory) {
    return postApiCall('project/' + projectName + '/delete-directory', undefined, {
      name: directory
    });
  },
  /**
   * Download Crowdin project glossaries as TBX file.
   */
  downloadGlossary: function (projectName) {
    return getApiRequest('project/' + projectName + '/download-glossary');
  },
  /**
   * Upload your glossaries for Crowdin Project in TBX file format.
   * @param projectName {String} Should contain the project identifier.
   * @param fileNameOrStream {String} Name of the file to upload or stream which contains file to upload.
   */
  uploadGlossary: function (projectName, fileNameOrStream) {
    if (typeof fileNameOrStream === 'string') {
      fileNameOrStream = fs.createReadStream(fileNameOrStream);
    }

    return postApiCall('project/' + projectName + '/upload-glossary', undefined, {
      file: fileNameOrStream
    });
  },
  /**
   * Download Crowdin project Translation Memory as TMX file.
   */
  downloadTranslationMemory: function (projectName) {
    return postApiCall('project/' + projectName + '/download-tm');
  },
  /**
   * Upload your Translation Memory for Crowdin Project in TMX file format.
   * @param projectName {String} Should contain the project identifier.
   * @param fileNameOrStream {String} Name of the file to upload or stream which contains file to upload.
   */
  uploadTranslationMemory: function (projectName, fileNameOrStream) {
    if (typeof fileNameOrStream === 'string') {
      fileNameOrStream = fs.createReadStream(fileNameOrStream);
    }

    return postApiCall('project/' + projectName + '/upload-tm', undefined, {
      file: fileNameOrStream
    });
  },
  /**
   * Get supported languages list with Crowdin codes mapped to locale name and standardized codes.
   */
  supportedLanguages: function () {
    return getApiCall('supported-languages');
  }
};
