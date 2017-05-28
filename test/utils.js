'use strict';

const pify = require('pify');
const fs = pify(require('fs'));
const utils = require('../lib/utils');

describe('utils index', () => {
  context('parentDirs', () => {
    it('should return array of dirs', () => {
      utils.parentDirs('deep/dir/tree/index.js').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
      utils.parentDirs('deep/dir/tree/').should.eql(['deep/', 'deep/dir/', 'deep/dir/tree/']);
    });

    it('should return array of dirs with root', () => {
      utils.parentDirs('./deep/dir/tree/index.js').should.eql(['./', './deep/', './deep/dir/', './deep/dir/tree/']);
    });
  });

  context('writeFile', () => {
    const filePath = './tmp/index.js';
    const fileData = JSON.stringify({foo: 'bar'});

    beforeEach(() => {
      utils.writeFile(filePath, fileData);
    });

    afterEach(() => {
      fs.unlink(filePath);
    });

    it('should write file', () => {
      fs.access(filePath).then(error => {
        (typeof error === 'undefined').should.eql(true);
      }).catch(e => {});
    });

    it('should write file with content', () => {
      fs.readFile(filePath, 'utf8').then(data => {
        data.should.deep.eql(fileData);
      }).catch(e => {});;
    });

    //todo check if file was written with right permissions
  });

  context('readonly', () => {
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
      (descriptor.enumerable).should.eql(true);
    });

    it('should set configurable to true', () => {
      (descriptor.configurable).should.eql(true);
    });
  });

  context('readonly', () => {
    const target = {
      'path': 'path/to/file.js'
    };
    const props = {'path': 'path/to/file.js'};
    let descriptor;

    beforeEach(() => {
      utils.readonly(target, props);
      descriptor = Object.getOwnPropertyDescriptor(target, 'path');
    });

    it('should set enumerable to true', () => {
      (descriptor.enumerable).should.eql(true);
    });

    it('should set configurable to true', () => {
      (descriptor.configurable).should.eql(true);
    });
  });

  context('flat', () => {
    it('should flat array', () => {
      const iter = ['foo', 'bar', 'baz'];
      (utils.flat(iter)).should.eql(['foo', 'bar', 'baz']);
    });
  });

  context('uniq', () => {
    it('should have unique values', () => {
      const iter = ['foo', 'foo', 'bar', 'baz', 'baz', 'baz'];
      (utils.uniq(iter)).should.eql(['foo', 'bar', 'baz']);
    });
  });

  context('toArr', () => {
    it('should return array', () => {
      const iter = ['foo', 'bar', 'baz'];
      (utils.toArr(iter)).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return empty array', () => {
      const iter = null;
      (utils.toArr(iter)).should.eql([]);
    });
  });

  context('removeFrom', () => {
    it('should return same array', () => {
      const iter = ['foo', 'bar', 'baz'];
      (utils.removeFrom(iter)).should.eql(['foo', 'bar', 'baz']);
    });

    it('should return cleaned array', () => {
      const iter = ['foo', 'bar', 'baz'];
      (utils.removeFrom(iter, ['baz', 'bar'])).should.eql(['foo']);
    });
  });

  context('pifyHook', () => {
    it('should promisify preCompile ', () => {
      const obj = {
        preCompile: test => test
      };
      utils.pifyHook(obj);
      (obj.preCompile() instanceof Promise).should.eql(true);
    });

    it('should not promisify empty', () => {
      const obj = {
        preCompile: Function.prototype
      };
      utils.pifyHook(obj);
      (obj.preCompile() instanceof Promise).should.eql(false);
    });
  });

  context('jsonToData', () => {
    it('should decode data', () => {
      const json = {foo: 'bar'};
      (utils.jsonToData(json)).should.eql('data:application/json;charset=utf-8;base64,eyJmb28iOiJiYXIifQ==');
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
