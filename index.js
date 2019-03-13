'use strict';

const fs = require('fs');
const request = require('request');
const requestPromise = require('request-promise');
const temp = require('temp');
const Bluebird = require('bluebird');

temp.track();

function resultToError(result) {
  return new Error('Error code ' + result.error.code + ': ' + result.error.message);
}

function parseError(err) {
  if (err.response && err.response.body) {
    try {
      const parsed = JSON.parse(err.response.body);
      return resultToError(parsed);
    } catch (parseErr) {
      // Return original error instead
      return err;
    }
  }

  return err;
}

async function handlePromise(request) {
  let body;
  try {
    body = await request;
  } catch (err) {
    throw parseError(err);
  }

  const result = JSON.parse(body);
  if (result.success === false) {
    throw resultToError(result);
  }

  return result;
}

async function handleStream(request) {
  const { path, fd } = await Bluebird.fromCallback(cb => {
    temp.open('crowdin', cb);
  });

  const out = fs.createWriteStream(null, {
    fd
  });

  return new Bluebird((resolve, reject) => {
    let statusCode;

    request
      .on('error', err => {
        return reject(parseError(err));
      })
      .on('response', response => {
        statusCode = response.statusCode;
      })
      .pipe(out);

    out.on('close', async () => {
      if (statusCode < 400) {
        return resolve(path);
      } else {
        try {
          let body = await Bluebird.fromCallback(cb => fs.readFile(path, {
            encoding: 'utf8'
          }, cb));

          try {
            const result = JSON.parse(body);

            return reject(resultToError(result));
          } catch (err) {
            console.log('Error parsing body', err);
            console.log(body);
          }
        } catch (err) {
          console.log('Error reading body file', err);
        }

        return reject(`Error streaming from Crowdin: ${statusCode}`);
      }
    });
  });
}

function packFiles(files) {
  return Object.keys(files).reduce((acc, crowdinPath) => {
    let value = files[crowdinPath];
    if (typeof value === 'string') {
      value = fs.createReadStream(value);
    }

    acc[`files[${crowdinPath}]`] = value;

    return acc;
  }, {});
}

class CrowdinApi {
  constructor({ baseUrl = 'https://api.crowdin.com', apiKey } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;

    if (!apiKey) {
      throw new Error('Please specify CrowdIn API key.');
    }
  }

  uri(path) {
    return `${this.baseUrl}/api/${path}`;
  }

  getPromise(path) {
    return handlePromise(requestPromise.get({
      uri: this.uri(path),
      qs: {
        json: true,
        key: this.apiKey
      }
    }));
  }

  postPromise(path, qs = {}, data) {
    return handlePromise(requestPromise.post({
      uri: this.uri(path),
      qs: {
        ...qs,
        json: true,
        key: this.apiKey
      },
      formData: data
    }));
  }

  getStream(path, qs = {}) {
    return handleStream(request.get({
      uri: this.uri(path),
      qs: {
        ...qs,
        json: true,
        key: this.apiKey
      }
    }));
  }

  /**
   * Add new file to Crowdin project
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Files array that should be added to Crowdin project.
   *   Array keys should contain file names with path in Crowdin project.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param params {Object} Information about uploaded files.
   */
  addFile(projectName, files, params) {
    return this.postPromise(`project/${projectName}/add-file`, undefined, {
      ...packFiles(files), ...params
    });
  }

  /**
   * Upload latest version of your localization file to Crowdin.
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Files array that should be updated.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param params {Object} Information about updated files.
   */
  updateFile(projectName, files, params) {
    return this.postPromise(`project/${projectName}/update-file`, undefined, {
      ...packFiles(files), ...params
    });
  }

  /**
   * Delete file from Crowdin project. All the translations will be lost without ability to restore them.
   * @param projectName {String} Should contain the project identifier
   * @param fileName {String} Name of file to delete.
   */
  deleteFile(projectName, fileName) {
    return this.postPromise(`project/${projectName}/delete-file`, undefined, {
      file: fileName
    });
  }

  /**
   * Upload existing translations to your Crowdin project
   * @param projectName {String} Should contain the project identifier
   * @param files {Array} Translated files array. Array keys should contain file names in Crowdin.
   *   Note! 20 files max are allowed to upload per one time file transfer.
   * @param language {String} Target language. With a single call it's possible to upload translations for several files but only into one of the languages
   * @param params {Object} Information about updated files.
   */
  updateTranslations(projectName, files, language, params) {
    return this.postPromise(`project/${projectName}/upload-translation`, undefined, {
      ...packFiles(files), ...params
    });
  }

  /**
   * Track your Crowdin project translation progress by language.
   * @param projectName {String} Should contain the project identifier.  */
  translationStatus(projectName) {
    return this.postPromise(`project/${projectName}/status`);
  }

  /**
   * Get the detailed translation progress for specified language.
   * @param projectName {String} Should contain the project identifier.
   * @param language {String} Crowdin language codes.  */
  languageStatus(projectName, language) {
    return this.postPromise(`project/${projectName}/language-status`, undefined, {
      language
    });
  }

  /**
   * Get Crowdin Project details.
   * @param projectName {String} Should contain the project identifier.
   */
  projectInfo(projectName) {
    return this.postPromise(`project/${projectName}/info`);
  }

  /**
   * Get a list of issues reported in the Editor.
   * @param projectName {String} Should contain the project identifier.
   * @param params {Object} See https://support.crowdin.com/api/issues/
   * @param params.type {String} Defines the issue type.
   * @param params.status {String} Defines the issue resolution status.
   * @param params.file {String} Defines the path of the file issues are associated with.
   * @param params.language {String} Defines the language issues are associated with.
   * @param params.date_from {String} Issues added from. Use the following ISO 8601 format: YYYY-MM-DD±hh:mm.
   * @param params.date_to {String} Issues added to. Use the following ISO 8601 format: YYYY-MM-DD±hh:mm. */
  reportedIssues(projectName, params = {}) {
    return this.postPromise(`project/${projectName}/language-status`, undefined, params);
  }

  /**
   * This method exports single translated files from Crowdin.
   * @param projectName {String} Should contain the project identifier.
   * @param file {String} This parameter specifies a path to the file that should be exported from the project.
   * @param language {String} Crowdin language code.
   * @param params {Object} See https://support.crowdin.com/api/export-file/
   * @param params.branch {String} The name of related version branch (Versions Management).
   * @param params.format {String} Specify xliff to export file in the XLIFF file format.
   * @param params.export_translated_only {Boolean} Defines whether only translated strings will be exported to the final file.
   * @param params.export_approved_only {Boolean} If set to 1 only approved translations will be exported in resulted file. */
  exportFile(projectName, file, language, params = {}) {
    return this.getStream(`project/${projectName}/export-file`, {
      ...params,
      file,
      language
    });
  }

  /**
   * Download ZIP file with translations. You can choose the language of translation you need.
   */
  downloadTranslations(projectName, languageCode) {
    return this.getStream(`project/${projectName}/download/${languageCode}.zip`);
  }

  /**
   * Download ZIP file with all translations.
   */
  downloadAllTranslations(projectName) {
    return this.getStream(`project/${projectName}/download/all.zip`);
  }

  /**
   * Build ZIP archive with the latest translations. Please note that this method can be invoked only once per 30 minutes (there is no such
   * restriction for organization plans). Also API call will be ignored if there were no changes in the project since previous export.
   * You can see whether ZIP archive with latest translations was actually build by status attribute ('built' or 'skipped') returned in response.
   */
  exportTranslations(projectName) {
    return this.getPromise(`project/${projectName}/export`);
  }

  /**
   * Get the status of translations export.
   * @param projectName {String} Project identifier.
   * @param branch {String} The name of related version branch (Versions Management).
   */
  translationExportStatus(projectName, branch = '') {
    return this.getPromise(`project/${projectName}/export-status`, {
      branch
    });
  }

  /**
   * Pre-translate Crowdin project files.
   * @param projectName {String} Project identifier.
   * @param languages {Array} Set of languages to which pre-translation should be applied.
   * @param files {Array} Files array that should be translated. Values should match your Crowdin project structure.
   * @param params {Object} https://support.crowdin.com/api/pre-translate/
   * @param params.method {String} Defines which method will be used for pre-translation.
   * @param params.engine {String} Defines engine for Machine Translation.
   * @param params.approve_translated {Boolean} Automatically approves translated strings.
   * @param params.auto_approve_option {Number} Defines which translations added by pre-translation via TM should be auto-approved.
   * @param params.import_duplicates {Boolean} Adds translations even if the same translation already exists.
   * @param params.apply_untranslated_strings_only {Boolean} Applies translations for untranslated strings only.
   * @param params.perfect_match {Boolean} Pre-translate will be applied only for those strings, that have absolute match in source text and contextual information.
   */
  preTranslate(projectName, languages, files, params = {}) {
    return this.postPromise(`project/${projectName}/pre-translate`, undefined, {
      ...params,
      languages,
      files
    });
  }

  /**
   * Edit Crowdin project
   * @param projectName {String} Name of the project to change
   * @param params {Object} New parameters for the project.
   */
  editProject(projectName, params) {
    return this.postPromise(`project/${projectName}/edit-project`, undefined, params);
  }

  /**
   * Delete Crowdin project with all translations.
   * @param projectName {String} Name of the project to delete.
   */
  deleteProject(projectName) {
    return this.postPromise(`project/${projectName}/delete-project`);
  }

  /**
   * Add directory to Crowdin project.
   * @param projectName {String} Should contain the project identifier.
   * @param directory {String} Directory name (with path if nested directory should be created).
   * @param params {Object} New parameters for the directory.
   */
  createDirectory(projectName, directory, params) {
    return this.postPromise(`project/${projectName}/add-directory`, params, {
      name: directory
    });
  }

  /**
   * Rename directory or modify its attributes. When renaming directory the path can not be changed (it means new_name parameter can not contain path, name only).
   * @param projectName {String} Full directory path that should be modified (e.g. /MainPage/AboutUs).
   * @param directory {String} New directory name.
   * @param params {Object} New parameters for the directory.
   */
  changeDirectory(projectName, directory, params) {
    return this.postPromise(`project/${projectName}/change-directory`, params, {
      name: directory
    });
  }

  /**
   * Delete Crowdin project directory. All nested files and directories will be deleted too.
   * @param projectName {String} Should contain the project identifier.
   * @param directory {String} Directory path (or just name if the directory is in root).
   */
  deleteDirectory(projectName, directory) {
    return this.postPromise(`project/${projectName}/delete-directory`, undefined, {
      name: directory
    });
  }

  /**
   * Download Crowdin project glossaries as TBX file.
   */
  downloadGlossary(projectName) {
    return this.getStream(`project/${projectName}/download-glossary`);
  }

  /**
   * Upload your glossaries for Crowdin Project in TBX file format.
   * @param projectName {String} Should contain the project identifier.
   * @param fileNameOrStream {String|ReadStream} Name of the file to upload or stream which contains file to upload.
   */
  uploadGlossary(projectName, fileNameOrStream) {
    if (typeof fileNameOrStream === 'string') {
      fileNameOrStream = fs.createReadStream(fileNameOrStream);
    }

    return this.postPromise(`project/${projectName}/upload-glossary`, undefined, {
      file: fileNameOrStream
    });
  }

  /**
   * Download Crowdin project Translation Memory as TMX file.
   */
  downloadTranslationMemory(projectName) {
    return this.postPromise(`project/${projectName}/download-tm`);
  }

  /**
   * Upload your Translation Memory for Crowdin Project in TMX file format.
   * @param projectName {String} Should contain the project identifier.
   * @param fileNameOrStream {String|ReadStream} Name of the file to upload or stream which contains file to upload.
   */
  uploadTranslationMemory(projectName, fileNameOrStream) {
    if (typeof fileNameOrStream === 'string') {
      fileNameOrStream = fs.createReadStream(fileNameOrStream);
    }

    return this.postPromise(`project/${projectName}/upload-tm`, undefined, {
      file: fileNameOrStream
    });
  }

  /**
   * Get supported languages list with Crowdin codes mapped to locale name and standardized codes.
   */
  supportedLanguages() {
    return this.getPromise('supported-languages');
  }

  /**
   * Generate pseudo translation files for the whole project.
   * @param projectName {String} Project identifier.
   * @param params {Object} https://support.crowdin.com/api/pseudo-export/
   * @param params.prefix {String} Add special characters at the beginning of each string to show where messages have been concatenated together.
   * @param params.suffix {String} Add special characters at the end of each string to show where messages have been concatenated together.
   * @param params.length_transformation {Number} Make string larger or shorter.
   * @param params.char_transformation {String} Transforms characters to other languages.
   */
  pseudoExport(projectName, params = {}) {
    return this.getPromise(`project/${projectName}/pseudo-export`, params);
  }

  /**
   * Download ZIP file with pseudo translations.
   * @param projectName {String} Project identifier.
   */
  pseudoDownload(projectName) {
    return this.getStream(`project/${projectName}/pseudo-download`);
  }

  /**
   * Generate Costs Estimation report to have an insight on how to plan the budget.
   * This report allows you to calculate the approximate translation cost of currently untranslated strings in the project.
   * @param projectName {String} Project identifier.
   * @param language {String} The language for which the report should be generated.
   * @param params {Object} https://support.crowdin.com/api/export-costs-estimation-report/
   * @param params.unit {String} Defines the report unit.
   * @param params.mode {String} Defines the report mode.
   * @param params.calculate_internal_fuzzy_matches {Boolean} Available for fuzzy mode only.
   * @param params.date_from {String} Strings added from.
   * @param params.date_to {String} Strings added to.
   * @param params.regular_rates {Array} Defines the regular rates for the specified categories.
   * @param params.individual_rates {Array} Defines individual rates for the specified languages in the specified categories.
   * @param params.currency {String} Defines the currency for which the whole report is generated.
   * @param params.format {String} Defines the export file format.
   */
  exportCostsEstimationReport(projectName, language, params = {}) {
    return this.postPromise(`project/${projectName}/reports/costs-estimation/export`, undefined, params);
  }

  /**
   * Download previously generated Costs Estimation report.
   * @param projectName {String} Project identifier.
   * @param hash {String} Defines hash previously received from the export of Costs Estimation report method.
   */
  downloadCostsEstimationReport(projectName, hash) {
    return this.getStream(`project/${projectName}/reports/costs-estimation/download`, {
      hash
    });
  }

  /**
   * Generate Translation Costs report to calculate the real translation cost and know how much your translators
   * and proofreaders should be paid.
   * @param projectName {String} Project identifier.
   * @param params {Object} https://support.crowdin.com/api/export-translation-costs-report/
   * @param params.unit {String} Defines the report unit.
   * @param params.mode {String} Defines the report mode.
   * @param params.date_from {String} Strings added from.
   * @param params.date_to {String} Strings added to.
   * @param params.regular_rates {Array} Defines the regular rates for the specified categories.
   * @param params.individual_rates {Array} Defines individual rates for the specified languages in the specified categories.
   * @param params.currency {String} Defines the currency for which the whole report is generated.
   * @param params.format {String} Defines the export file format.
   * @param params.role_based_costs {Boolean} Defines whether the costs should be calculated based on contributions or on the role in the project.
   * @param params.group_by {String} Group data by 'user' (default) or by 'language'.
   */
  exportTranslationCostsReport(projectName, params = {}) {
    return this.postPromise(`project/${projectName}/reports/translation-costs/export`, undefined, params);
  }

  /**
   * Download previously generated Translation Costs report.
   * @param projectName {String} Project identifier.
   * @param hash {String} Defines hash previously received from the export of Translation Costs report method.
   */
  downloadTranslationCostsReport(projectName, hash) {
    return this.getStream(`project/${projectName}/reports/translation-costs/download`, {
      hash
    });
  }

  /**
   * Generate Top Members report to know who contributed the most to
   * your project's translation during the specified date range.
   * @param projectName {String} Project identifier.
   * @param params {Object} https://support.crowdin.com/api/export-top-members-report/
   * @param params.unit {String} Defines the report unit.
   * @param params.language {String} The language for which the report should be generated.
   * @param params.date_from {String} Strings added from.
   * @param params.date_to {String} Strings added to.
   * @param params.format {String} Defines the export file format.
   */
  exportTopMembersReport(projectName, params = {}) {
    return this.postPromise(`project/${projectName}/reports/top-members/export`, undefined, params);
  }

  /**
   * Download previously generated Top Members report.
   * @param projectName {String} Project identifier.
   * @param hash {String} Defines hash previously received from the export of Top Members report method.
   */
  downloadTopMembersReport(projectName, hash) {
    return this.getStream(`project/${projectName}/reports/top-members/download`, {
      hash
    });
  }
}

module.exports = CrowdinApi;
