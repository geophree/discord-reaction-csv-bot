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
    headers: {
      'X-Signature-Timestamp': '1',
      'X-Signature-Ed25519': '1',
    },
    method: 'POST',
    body: JSON.stringify(bodyObj),
  });
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
    let verifyKeyStub;

    beforeEach(() => {
      verifyKeyStub = sinon.stub(server, 'verifyKey');
    });

    afterEach(() => {
      verifyKeyStub.restore();
    });

    it('should reject an unverifiable request', async (t) => {
      const request = makePostRequest({
        type: InteractionType.PING,
      });

      verifyKeyStub.resolves(false);

      const response = await server.fetch(request, {});
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, 'Bad request signature.');
    });

    it('should reject a request with bad json', async (t) => {
      const request = new Request(makePostRequest(), { body: '.' });

      verifyKeyStub.resolves(true);

      const response = await server.fetch(request, {});
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, 'Bad request json format.');
    });

    it('should reject a request with no type', async (t) => {
      const request = new Request(makePostRequest(), { body: 'false' });

      verifyKeyStub.resolves(true);

      const response = await server.fetch(request, {});
      t.assert.strictEqual(response.status, 400);
      const body = await response.json();
      t.assert.strictEqual(body.error, 'Unknown Interaction Type: undefined');
    });

    it('should handle a PING interaction', async (t) => {
      const request = makePostRequest({
        type: InteractionType.PING,
      });

      verifyKeyStub.resolves(true);

      const response = await server.fetch(request, {});
      const body = await response.json();
      t.assert.strictEqual(body.type, InteractionResponseType.PONG);
    });

    it('should handle an REACTION_CSV command interaction', async (t) => {
      const request = makePostRequest({
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: REACTION_CSV_COMMAND.name,
        },
      });

      verifyKeyStub.resolves(true);

      // // mock the fetch call
      // const result = sinon
      //   // eslint-disable-next-line no-undef
      //   .stub(global, 'fetch')
      //   .withArgs('https://cute.com')
      //   .resolves({
      //     status: 200,
      //     ok: true,
      //     json: sinon.fake.resolves({ data: { children: [] } }),
      //   });

      const response = await server.fetch(request, {});
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

      const env = {
        DISCORD_APPLICATION_ID: '123456789',
      };

      verifyKeyStub.resolves(true);

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

      verifyKeyStub.resolves(true);

      const response = await server.fetch(request, {});
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

      verifyKeyStub.resolves(true);

      const response = await server.fetch(request, {});
      const body = await response.json();
      t.assert.strictEqual(response.status, 400);
      t.assert.strictEqual(body.error, `Unknown Interaction Type: ${type}`);
    });
  });

  describe('All other routes', () => {
    it('should return a "Not Found" response', async (t) => {
      const request = new Request('http://discordo.example/unknown', {
        headers: {
          'X-Signature-Timestamp': '1',
          'X-Signature-Ed25519': '1',
        },
      });
      const response = await server.fetch(request, {});
      t.assert.strictEqual(response.status, 404);
      const body = await response.text();
      t.assert.ok(body.includes('Not Found'));
    });
  });
});
