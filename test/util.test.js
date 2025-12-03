import { beforeEach, describe, it } from 'node:test';

import {
  encodedEmojiKey,
  readableEmojiKey,
  ReactionUserListFetcher,
  csvQuote,
  CsvBuilder,
} from '../src/util.js';

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Util', () => {
  describe('Emoji keys', () => {
    const em = (name, id, animated) => ({ name, id, animated });

    it('should correctly key unicode emojis', (t) => {
      const e = em('\u{1F60A}');
      t.assert.strictEqual(encodedEmojiKey(e), '%F0%9F%98%8A');
      t.assert.strictEqual(readableEmojiKey(e), '\u{1F60A}');
    });

    it('should correctly key non-animated custom emoji', (t) => {
      const e = em('blob_no', '941597088247083018');
      t.assert.strictEqual(encodedEmojiKey(e), 'blob_no:941597088247083018');
      t.assert.strictEqual(readableEmojiKey(e), 'blob_no:941597088247083018');
    });

    it('should correctly key animated custom emoji', (t) => {
      const e = em('_thurston', '890457955345002547', true);
      t.assert.strictEqual(
        encodedEmojiKey(e),
        'a:_thurston:890457955345002547',
      );
      t.assert.strictEqual(
        readableEmojiKey(e),
        'a:_thurston:890457955345002547',
      );
    });
  });

  describe('ReactionUserListFetcher', () => {
    let env;

    beforeEach((t) => {
      env = { DISCORD_TOKEN: '123456789' };
      t.mock.method(globalThis, 'fetch', () => {});
    });

    it('should fetch reactions for an emoji', async (t) => {
      const message = {
        message_id: 11,
        channel_id: 75,
      };
      const fetcher = new ReactionUserListFetcher(message, env);

      const expectedUserList = [
        { id: 27, username: 'hello' },
        { id: 42, username: 'goodbye' },
      ];
      fetch.mock.mockImplementation(async () => jsonResponse(expectedUserList));

      const userList = await fetcher.fetch({ name: '\u{1F60A}' });
      t.assert.deepEqual(userList, expectedUserList);
    });

    it('should handle fetch errors', async (t) => {
      const message = {
        message_id: 11,
        channel_id: 75,
      };
      const fetcher = new ReactionUserListFetcher(message, env);

      fetch.mock.mockImplementation(async () => false);

      await t.assert.rejects(fetcher.fetch({ name: 'q' }), /falsy/);

      fetch.mock.mockImplementation(async () => ({
        ok: false,
        status: 404,
        text: () => Promise.resolve('sekrit'),
      }));

      await t.assert.rejects(fetcher.fetch({ name: 'q' }), /404.*sekrit/);
    });
  });

  describe('CSV', () => {
    describe('Quoting', () => {
      it('should correctly quote line feed', (t) => {
        t.assert.strictEqual(csvQuote('hello\nworld'), '"hello\nworld"');
      });
      it('should correctly quote double quote', (t) => {
        t.assert.strictEqual(csvQuote('hello"world"'), '"hello""world"""');
      });
      it('should not quote single quote', (t) => {
        t.assert.strictEqual(csvQuote("hello'world"), "hello'world");
      });
      it('should correctly quote comma', (t) => {
        t.assert.strictEqual(csvQuote('hello,world'), '"hello,world"');
      });
      it('should not quote space', (t) => {
        t.assert.strictEqual(csvQuote('hello world'), 'hello world');
      });
      it('should not quote normal characters', (t) => {
        t.assert.strictEqual(
          csvQuote('here_are_some.normal+characters'),
          'here_are_some.normal+characters',
        );
      });
      it('should not quote unicode characters', (t) => {
        t.assert.strictEqual(csvQuote('\u{1F60A}'), '\u{1F60A}');
      });
      it('should toString its argument', (t) => {
        t.assert.strictEqual(csvQuote(5), '5');
        t.assert.strictEqual(csvQuote({}), '[object Object]');
      });
    });

    describe('Building', () => {
      it('should correctly quote the entries', (t) => {
        const builder = new CsvBuilder(['"hello"', 'howdy']);
        builder.addLine(['bye, bye', 1000]);
        builder.addLine([1, '\u{1F60A}']);
        t.assert.strictEqual(
          builder.build(),
          '"""hello""",howdy\n"bye, bye",1000\n1,\u{1F60A}\n',
        );
      });

      it('should work without a header', (t) => {
        const builder = new CsvBuilder();
        builder.addLine(['bye, bye', 1000]);
        builder.addLine([1, '\u{1F60A}']);
        t.assert.strictEqual(builder.build(), '"bye, bye",1000\n1,\u{1F60A}\n');
      });
    });
  });
});
