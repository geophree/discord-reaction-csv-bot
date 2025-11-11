import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  InteractionResponseType,
  InteractionType,
  InteractionResponseFlags,
} from 'discord-interactions';
import { REACTION_CSV_COMMAND, INVITE_COMMAND } from '../src/commands.js';
import sinon from 'sinon';
import server from '../src/server.js';

function makePostRequest(bodyObj) {
  return new Request('http://discordo.example', {
    method: 'POST',
    body: JSON.stringify(bodyObj),
  });
}

async function passMiddleware(req, _res, next) {
  req.body = JSON.parse(req.body.toString('utf-8')) || {};
  next();
}

function emojiFromKey(key) {
  const parts = key.split(':');
  let id, name, animated;
  switch (parts.length) {
    case 1:
      [name] = parts;
      break;
    case 2:
      [name, id] = parts;
      break;
    case 3:
      [, name, id] = parts;
      animated = true;
      break;
  }
  return { id, name: decodeURIComponent(name), animated };
}

function makeMessageWithReactions(reactions = {}) {
  return {
    id: '1000',
    channel_id: '1',
    reactions: Object.entries(reactions).map(([emojiKey, count]) => ({
      count,
      emoji: emojiFromKey(emojiKey),
    })),
  };
}

function makeReactionCsvRequestBody(reactions) {
  const message = makeMessageWithReactions(reactions);
  return {
    type: InteractionType.APPLICATION_COMMAND,
    data: {
      name: REACTION_CSV_COMMAND.name,
      resolved: {
        messages: {
          [message.id]: message,
        },
      },
      target_id: message.id,
    },
  };
}

describe('Server', () => {
  describe('GET /', () => {
    it('should return a greeting message with the Discord application ID', async (t) => {
      const request = {
        method: 'GET',
        url: new URL('/', 'http://discordo.example'),
      };
      const env = { DISCORD_APPLICATION_ID: '123456789' };

      const response = await server.fetch(request, env);
      const body = await response.text();

      t.assert.strictEqual(body, '👋 123456789');
    });
  });

  describe('POST /', () => {
    let verifyKeyMiddlewareStub;
    // let ReactionUserListFetcherStub;
    let env;

    beforeEach(() => {
      env = {
        DISCORD_APPLICATION_ID: '123456789',
      };
      verifyKeyMiddlewareStub = sinon.stub(server, 'verifyKeyMiddleware');
      // _ReactionUserListFetcherStub = sinon.stub(
      //   server,
      //   'ReactionUserListFetcher',
      // );
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should reject a request with no type', async (t) => {
      const request = new Request(makePostRequest(), { body: 'false' });

      verifyKeyMiddlewareStub.returns(passMiddleware);

      const err = sinon.stub(globalThis.console, 'error');
      const response = await server.fetch(request, env);
      err.restore();

      t.assert.strictEqual(response.status, 400);
      const body = await response.json();
      t.assert.strictEqual(body.error, 'Unknown Interaction Type: undefined');
    });

    it('should handle a REACTION_CSV command interaction', async (t) => {
      const request = makePostRequest(makeReactionCsvRequestBody({}));

      verifyKeyMiddlewareStub.returns(passMiddleware);
      //ReactionUserListFetcherStub.returns({

      // // mock the fetch call
      // const result = sinon
      //   // eslint-disable-next-line no-undef
      //   .stub(globalThis, 'fetch')
      //   .withArgs('https://cute.com')
      //   .resolves({
      //     status: 200,
      //     ok: true,
      //     json: sinon.fake.resolves({ data: { children: [] } }),
      //   });

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(
        body.type,
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      //t.assert.ok(result.calledOnce);
    });

    it('should handle an invite command interaction', async (t) => {
      const request = makePostRequest({
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: INVITE_COMMAND.name,
        },
      });

      verifyKeyMiddlewareStub.returns(passMiddleware);

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(
        body.type,
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      t.assert.ok(
        body.data.content.includes(
          'https://discord.com/oauth2/authorize?client_id=123456789&scope=applications.commands',
        ),
      );
      t.assert.strictEqual(body.data.flags, InteractionResponseFlags.EPHEMERAL);
    });

    it('should handle an unknown command interaction', async (t) => {
      const name = 'unknown';
      const request = makePostRequest({
        type: InteractionType.APPLICATION_COMMAND,
        data: { name },
      });

      verifyKeyMiddlewareStub.returns(passMiddleware);

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(response.status, 400);
      t.assert.strictEqual(body.error, `Unknown Command: ${name}`);
    });

    it('should handle an unknown interaction type', async (t) => {
      const type =
        Math.max(
          ...Object.values(InteractionType).filter(
            (x) => typeof x === 'number',
          ),
        ) + 1;
      const request = makePostRequest({
        type,
        data: {
          name: 'unknown',
        },
      });

      verifyKeyMiddlewareStub.returns(passMiddleware);

      const err = sinon.stub(globalThis.console, 'error');
      const response = await server.fetch(request, env);
      err.restore();

      const body = await response.json();
      t.assert.strictEqual(response.status, 400);
      t.assert.strictEqual(body.error, `Unknown Interaction Type: ${type}`);
    });
  });

  describe('All other routes', () => {
    it('should return a "Not Found" response', async (t) => {
      const env = {
        DISCORD_PUBLIC_KEY: '8BADF00D',
        DISCORD_APPLICATION_ID: '123456789',
      };
      const request = new Request('http://discordo.example/unknown');
      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 404);
      const body = await response.text();
      t.assert.ok(body.includes('Not Found'));
    });
  });
});
