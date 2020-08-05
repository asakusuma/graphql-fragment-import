'use strict';

const execa = require('execa');
const { expect } = require('chai');
const cli = require.resolve('../lib/cli');
const FixturifyProject = require('fixturify-project');
const fs = require('fs');
const walkSync = require('walk-sync');

const HELP_OUTPUT = require('../lib/help-output');

describe('cli', function() {
  it(`prints help when explicitly provided with '--help'`, async function() {
    const childProcess = await execa('node', [cli, '--help']);
    expect(childProcess.stdout).to.eql(HELP_OUTPUT);
    expect(childProcess.stderr).to.eql('');
    expect(childProcess.exitCode).to.eql(0);
  });

  it(`prints help when explicitly provided with no inputs`, async function() {
    const childProcess = await execa('node', [cli], {
      reject: false
    });

    expect(childProcess.stdout).to.eql(HELP_OUTPUT);
    expect(childProcess.stderr).to.eql('');
    expect(childProcess.exitCode).to.not.eql(0);
  });

  describe('some real examples', function() {
    let basedir;
    beforeEach(function() {
      const project = new FixturifyProject('project-name', '0.0.0', project => {
        project.files['all-people.graphql'] = `
#import "./_person.graphql"
query {
  allPeople {
    ...Person
  }
}`;

        project.files['nested'] = {
        'other-people.graphql': `
#import "../_person.graphql"
query {
  nestedOtherPeople {
    ...Person
  }
}`
        };

        project.files['some-people.graphql'] = `
#import "./_person.graphql"
query {
  somePeople {
    ...Person
  }
}`;
        project.files['_person.graphql'] = `fragment Person on Person {
  id
  name
}`;
        project.writeSync();
        basedir = project.baseDir;
      });
    });

    const ALL_PEOPLE_WITH_IMPORTS = `
fragment Person on Person {
  id
  name
}
query {
  allPeople {
    ...Person
  }
}`;



    const SOME_PEOPLE_WITH_IMPORTS = `
fragment Person on Person {
  id
  name
}
query {
  somePeople {
    ...Person
  }
}`;


    const NESTED_OTHER_PEOPLE_WITH_IMPORTS = `
fragment Person on Person {
  id
  name
}
query {
  nestedOtherPeople {
    ...Person
  }
}`;

    it('works on a simple example', async function() {
      const childProcess = await execa('node', [cli, `${basedir}/all-people.graphql`])
      expect(childProcess.stderr).to.eql(``);
      expect(childProcess.stdout).to.eql(ALL_PEOPLE_WITH_IMPORTS);
    });

    it('supports -o', async function() {
      const childProcess = await execa('node', [
        cli,
        `${basedir}/all-people.graphql`,
        '-o',
        `${basedir}/all-people-with-imports.graphql`
      ]);

      expect(childProcess.stderr).to.eql(``);
      expect(childProcess.stdout).to.eql(``);

      const output = fs.readFileSync(`${basedir}/all-people-with-imports.graphql`, 'UTF8');

      expect(output).to.eql(ALL_PEOPLE_WITH_IMPORTS);
    });

    it('does not support both output and output-dir at the same time', async function() {
      const childProcess = await execa('node', [
        cli,
        '-o',
        'output-file',
        '-d',
        'output-dir'
      ], {
        reject: false
      });

      expect(childProcess.exitCode).to.eql(1);
      expect(childProcess.stdout).to.eql('');
      // TODO: prettier errors
      expect(childProcess.stderr).to.includes('Cannot have both --output and --output-dir specified')
    });

    it('fails if one file input is provide with --output-dir', async function() {
      const childProcess = await execa('node', [
        cli,
        `${basedir}/all-people.graphql`,
        '-d',
        `${basedir}/output/`
      ], {
        reject: false
      });

      expect(childProcess.exitCode).to.eql(1);
      expect(childProcess.stdout).to.eql('');
      expect(childProcess.stderr).to.includes('When providing an input file, you must specify --output');
    });


    it('fails if multiple inputs are provide without --output-dir', async function() {
      const childProcess = await execa('node', [
        cli,
        `${basedir}/all-people.graphql`,
        `${basedir}/some-people.graphql`
      ], {
        reject: false
      });

      expect(childProcess.exitCode).to.eql(1);
      expect(childProcess.stdout).to.eql('');
      expect(childProcess.stderr).to.includes(`invalid number of inputs, expected '1' but got '2'`);
    });

    it('handles multiple inputs with --output-dir', async function() {
      const childProcess = await execa('node', [
        cli,
        `${basedir}`,
        '-d',
        `${basedir}/output/`
      ]);

      expect(childProcess.exitCode).to.eql(0);
      expect(childProcess.stdout).to.eql(
`  [processed] all-people.graphql -> ${basedir}/output//all-people.graphql
  [processed] nested/other-people.graphql -> ${basedir}/output//nested/other-people.graphql
  [processed] some-people.graphql -> ${basedir}/output//some-people.graphql`);
      expect(childProcess.stderr).to.includes('');

      expect(walkSync(`${basedir}/output`, { directories: false })).to.eql([
        'all-people.graphql',
        'nested/other-people.graphql',
        'some-people.graphql',
      ]);

      expect(fs.readFileSync(`${basedir}/output/all-people.graphql`, 'UTF8')).to.eql(ALL_PEOPLE_WITH_IMPORTS);
      expect(fs.readFileSync(`${basedir}/output/some-people.graphql`, 'UTF8')).to.eql(SOME_PEOPLE_WITH_IMPORTS);
      expect(fs.readFileSync(`${basedir}/output/nested/other-people.graphql`, 'UTF8')).to.eql(NESTED_OTHER_PEOPLE_WITH_IMPORTS);
    });
  });
});
