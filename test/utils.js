'use strict';

const pify = require('pify');
const fs = pify(require('fs'));
const utils = require('../lib/utils');

describe('utils index', () => {
  describe('parentDirs', () => {
    it('should return array of dirs', () => {
      utils.parentDirs('deep/dir/tree/index.js').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
      utils.parentDirs('deep/dir/tree/').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
    });

    it('should return array of dirs with root', () => {
      utils.parentDirs('./deep/dir/tree/index.js').should.eql(['./', './deep/', './deep/dir/', './deep/dir/tree/']);
    });
  });

  describe('writeFile', () => {
    const filePath = './test/tmp/index.js';
    const fileData = JSON.stringify({foo: 'bar'});

    beforeEach(() => {
      return utils.writeFile(filePath, fileData);
    });

    afterEach(() => {
      return fs.unlink(filePath);
    });

    it('should write file', () => {
      fs.existsSync(filePath).should.be.true;
    });

    it('should write file with content', () => {
      return fs.readFile(filePath, 'utf8').then(data => {
        data.should.eql(fileData);
      });
    });

    //todo check if file was written with right permissions
  });

  describe('readonly', () => {
    let target = {
      'path': 'path/to/file.js'
    };
    const props = {'path': 'path/to/file.js'};
    let descriptor;

    beforeEach(() => {
      utils.readonly(target, props);
      descriptor = Object.getOwnPropertyDescriptor(target, 'path');
    });

    it('should set enumerable to true', () => {
      descriptor.enumerable.should.eql(true);
    });

    it('should set configurable to true', () => {
      descriptor.configurable.should.eql(true);
    });
  });

  describe('flat', () => {
    it('should flat array', () => {
      const iter = ['foo', 'bar', 'baz'];
      utils.flat(iter).should.eql(['foo', 'bar', 'baz']);
    });
  });

  describe('uniq', () => {
    it('should have unique values', () => {
      const iter = ['foo', 'foo', 'bar', 'baz', 'baz', 'baz'];
      utils.uniq(iter).should.eql(['foo', 'bar', 'baz']);
    });
  });

  describe('toArr', () => {
    it('should return array', () => {
      const iter = ['foo', 'bar', 'baz'];
      utils.toArr(iter).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return empty array', () => {
      const iter = null;
      utils.toArr(iter).should.eql([]);
    });
  });

  describe('removeFrom', () => {
    it('should return same array', () => {
      const iter = ['foo', 'bar', 'baz'];
      utils.removeFrom(iter).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return cleaned array', () => {
      const iter = ['foo', 'bar', 'baz'];
      utils.removeFrom(iter, ['baz', 'bar']).should.eql(['foo']);
    });
  });

  describe('pifyHook', () => {
    it('should promisify preCompile ', () => {
      const obj = {
        preCompile: test => test
      };
      utils.pifyHook(obj);
      obj.preCompile().should.be.an.instanceOf(Promise);
    });

    it('should not promisify empty', () => {
      const obj = {
        preCompile: () => 'test'
      };
      utils.pifyHook(obj);
      obj.preCompile().should.not.be.an.instanceOf(Promise);
    });
  });

  describe('jsonToData', () => {
    it('should decode data', () => {
      const json = {foo: 'bar'};
      utils.jsonToData(json).should.eql('data:application/json;charset=utf-8;base64,eyJmb28iOiJiYXIifQ==');
    });
  });

  //todo
  // - debounce
  // - deepFreeze
  // - isSymlink
  // - asyncFilter
  // - asyncReduce
  // - FrozenMap
  // - FrozenSet
  // - pull
});
