'use strict';

const {readdirSync, statSync} = require('fs');
const {join} = require('path');
const runBenchmark = require('./benchmark');
const {
  buildReactBundles,
  buildBenchmark,
  buildBenchmarkBundlesFromGitRepo,
  getMergeBaseFromLocalGitRepo,
} = require('./build');
const argv = require('minimist')(process.argv.slice(2));
const chalk = require('chalk');
const printResults = require('./stats');
const serveBenchmark = require('./server');

function getBenchmarkNames() {
  return readdirSync(join(__dirname, 'benchmarks')).filter(file =>
    statSync(join(__dirname, 'benchmarks', file)).isDirectory()
  );
}

function wait(val) {
  return new Promise(resolve => setTimeout(resolve, val));
}

const runRemote = argv.remote;
const runLocal = argv.local;
const benchmarkFilter = argv.benchmark;
const headless = argv.headless;
const skipBuild = argv['skip-build'];

async function runBenchmarks(reactPath) {
  const benchmarkNames = getBenchmarkNames();
  const results = {};
  const server = serveBenchmark();
  await wait(1000);

  for (let i = 0; i < benchmarkNames.length; i++) {
    const benchmarkName = benchmarkNames[i];

    if (
      !benchmarkFilter ||
      (benchmarkFilter && benchmarkName.indexOf(benchmarkFilter) !== -1)
    ) {
      console.log(
        chalk.gray(`- Building benchmark "${chalk.white(benchmarkName)}"...`)
      );
      await buildBenchmark(reactPath, benchmarkName);
      console.log(
        chalk.gray(`- Running benchmark "${chalk.white(benchmarkName)}"...`)
      );
      results[benchmarkName] = await runBenchmark(benchmarkName, headless);
    }
  }

  server.close();
  // http-server.close() is async but they don't provide a callback..
  await wait(500);
  return results;
}

// get the performance benchmark results
// from remote main (default React repo)
async function benchmarkRemoteMain() {
  console.log(chalk.gray(`- Building React bundles...`));
  let commit = argv.remote;

  if (!commit || typeof commit !== 'string') {
    commit = await getMergeBaseFromLocalGitRepo(join(__dirname, '..', '..'));
    console.log(
      chalk.gray(`- Merge base commit ${chalk.white(commit.tostrS())}`)
    );
  }
  await buildBenchmarkBundlesFromGitRepo(commit, skipBuild);
  return {
    benchmarks: await runBenchmarks(),
  };
}

// get the performance benchmark results
// of the local react repo
async function benchmarkLocal(reactPath) {
  console.log(chalk.gray(`- Building React bundles...`));
  await buildReactBundles(reactPath, skipBuild);
  return {
    benchmarks: await runBenchmarks(reactPath),
  };
}

async function runLocalBenchmarks(showResults) {
  console.log(
    chalk.white.bold('Running benchmarks for ') +
      chalk.green.bold('Local (Current Branch)')
  );
  const localResults = await benchmarkLocal(join(__dirname, '..', '..'));

  if (showResults) {
    printResults(localResults, null);
  }
  return localResults;
}

async function runRemoteBenchmarks(showResults) {
  console.log(
    chalk.white.bold('Running benchmarks for ') +
      chalk.yellow.bold('Remote (Merge Base)')
  );
  const remoteMainResults = await benchmarkRemoteMain();

  if (showResults) {
    printResults(null, remoteMainResults);
  }
  return remoteMainResults;
}

async function compareLocalToMain() {
  console.log(
    chalk.white.bold('Comparing ') +
      chalk.green.bold('Local (Current Branch)') +
      chalk.white.bold(' to ') +
      chalk.yellow.bold('Remote (Merge Base)')
  );
  const localResults = await runLocalBenchmarks(false);
  const remoteMainResults = await runRemoteBenchmarks(false);
  printResults(localResults, remoteMainResults);
}

if ((runLocal && runRemote) || (!runLocal && !runRemote)) {
  compareLocalToMain().then(() => process.exit(0));
} else if (runLocal) {
  runLocalBenchmarks(true).then(() => process.exit(0));
} else if (runRemote) {
  runRemoteBenchmarks(true).then(() => process.exit(0));
}
