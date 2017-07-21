'use strict';

const pify = require('pify');
const fs = pify(require('fs'));
const {
  parentDirs,
  writeFile,
  readonly,
  flat,
  uniq,
  toArr,
  removeFrom,
  pifyHook,
  jsonToData
} = require('../lib/utils');

describe('utils index', () => {
  describe('parentDirs', () => {
    it('should return array of dirs', () => {
      parentDirs('deep/dir/tree/index.js').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
      parentDirs('deep/dir/tree/').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
    });

    it('should return array of dirs with root', () => {
      parentDirs('./deep/dir/tree/index.js').should.eql(['./', './deep/', './deep/dir/', './deep/dir/tree/']);
    });
  });

  describe('writeFile', () => {
    const filePath = './test/tmp/index.js';
    const fileData = JSON.stringify({foo: 'bar'});

    beforeEach(() => {
      return writeFile(filePath, fileData);
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
    it('should set enumerable and configurable to true', () => {
      const target = {
        'path': 'path/to/file.js'
      };
      const props = {'path': 'path/to/file.js'};
      readonly(target, props);
      const descriptor = Object.getOwnPropertyDescriptor(target, 'path');

      descriptor.enumerable.should.eql(true);
      descriptor.configurable.should.eql(true);
    });
  });

  describe('flat', () => {
    it('should flat empty array', () => {
      flat([]).should.eql([]);
    });

    it('should flat low level array', () => {
      flat(['foo', 'bar', 'baz']).should.eql(['foo', 'bar', 'baz']);
    });

    it('should flat deep level array', () => {
      flat([['foo', 'bar'], 'baz']).should.eql(['foo', 'bar', 'baz']);
    });
  });

  describe('uniq', () => {
    it('should have unique values', () => {
      uniq(['foo', 'foo', 'bar', 'baz', 'baz', 'baz']).should.eql(['foo', 'bar', 'baz']);
    });
  });

  describe('toArr', () => {
    it('should return array', () => {
      toArr(['foo', 'bar', 'baz']).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return empty array', () => {
      toArr(null).should.eql([]);
    });
  });

  describe('removeFrom', () => {
    it('should return same array', () => {
      removeFrom(['foo', 'bar', 'baz']).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return cleaned array', () => {
      removeFrom(['foo', 'bar', 'baz'], ['baz', 'bar']).should.eql(['foo']);
    });
  });

  describe('pifyHook', () => {
    it('should promisify preCompile ', () => {
      const obj = {
        preCompile: test => test
      };
      pifyHook(obj);
      obj.preCompile().should.be.an.instanceOf(Promise);
    });

    it('should not promisify empty', () => {
      const obj = {
        preCompile: () => 'test'
      };
      pifyHook(obj);
      obj.preCompile().should.not.be.an.instanceOf(Promise);
    });
  });

  describe('jsonToData', () => {
    it('should decode data', () => {
      jsonToData({foo: 'bar'}).should.eql('data:application/json;charset=utf-8;base64,eyJmb28iOiJiYXIifQ==');
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
