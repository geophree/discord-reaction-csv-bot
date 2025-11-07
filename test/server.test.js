import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  InteractionResponseType,
  InteractionType,
  InteractionResponseFlags,
} from 'discord-interactions';
import { REACTION_CSV_COMMAND, INVITE_COMMAND } from '../src/commands.js';
import sinon from 'sinon';
import server from '../src/server.js';
const { subtle } = globalThis.crypto;

const TEST_PRIVATE_KEY_JWK = {
  key_ops: ['sign'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  d: 'xiy1Hknjlz6u3OH1Le3XpNZ2Q0_FFii6C8S1s6o0pfk',
  x: 'U4o-S7CINdaLu7vXEjhqnHVStx75LlIqlxvIf1nxmF4',
  kty: 'OKP',
};

const TEST_PRIVATE_KEY = await subtle.importKey(
  'jwk',
  TEST_PRIVATE_KEY_JWK,
  {
    name: 'ed25519',
    namedCurve: 'ed25519',
  },
  true,
  ['sign'],
);

const TEST_PUBLIC_KEY_HEX =
  '538a3e4bb08835d68bbbbbd712386a9c7552b71ef92e522a971bc87f59f1985e';

function hexStringFromArrayBuffer(arrayBuff) {
  return [...new Uint8Array(arrayBuff)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

// function arrayBufferFromHexString(str) {
//   const matches = str.match(/.{1,2}/g);
//   const hexVal = matches.map((byte) => Number.parseInt(byte, 16));
//   return new Uint8Array(hexVal);
// }

function makePostRequest(bodyObj) {
  return new Request('http://discordo.example', {
    method: 'POST',
    body: JSON.stringify(bodyObj),
  });
}

async function makeSignedPostRequest(bodyObj) {
  const TIMESTAMP = '2025-11-06T21:41:40Z';
  const body = JSON.stringify(bodyObj);
  const encoded = new TextEncoder().encode(TIMESTAMP + body);
  const signature = await subtle.sign('Ed25519', TEST_PRIVATE_KEY, encoded);
  const hexSignature = hexStringFromArrayBuffer(signature);
  return new Request('http://discordo.example', {
    headers: {
      'X-Signature-Timestamp': '2025-11-06T21:41:40Z',
      'X-Signature-Ed25519': hexSignature,
    },
    method: 'POST',
    body,
  });
}

async function passMiddleware(req, _res, next) {
  req.body = JSON.parse(req.body.toString('utf-8')) || {};
  next();
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
    let env;

    beforeEach(() => {
      env = {
        DISCORD_PUBLIC_KEY: TEST_PUBLIC_KEY_HEX,
        DISCORD_APPLICATION_ID: '123456789',
      };
      verifyKeyMiddlewareStub = sinon.stub(server, 'verifyKeyMiddleware');
    });

    afterEach(() => {
      verifyKeyMiddlewareStub.restore();
    });

    it('should reject an unverifiable request', async (t) => {
      const request = makePostRequest({
        type: InteractionType.PING,
      });

      verifyKeyMiddlewareStub.restore();

      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, '[discord-interactions] Invalid signature');
    });

    it('should reject a request with a bad signature', async (t) => {
      const request = new Request(
        makePostRequest({
          type: InteractionType.PING,
        }),
        {
          headers: {
            'X-Signature-Timestamp': '1',
            'X-Signature-Ed25519': '1',
          },
        },
      );

      verifyKeyMiddlewareStub.restore();

      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, '[discord-interactions] Invalid signature');
    });

    it('should reject a request with no type', async (t) => {
      const request = new Request(makePostRequest(), { body: 'false' });

      verifyKeyMiddlewareStub.returns(passMiddleware);

      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 400);
      const body = await response.json();
      t.assert.strictEqual(body.error, 'Unknown Interaction Type: undefined');
    });

    it('should handle a PING interaction', async (t) => {
      const request = await makeSignedPostRequest({
        type: InteractionType.PING,
      });

      verifyKeyMiddlewareStub.restore();

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(body.type, InteractionResponseType.PONG);
    });

    it('should handle a REACTION_CSV command interaction', async (t) => {
      const request = makePostRequest({
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: REACTION_CSV_COMMAND.name,
        },
      });

      verifyKeyMiddlewareStub.returns(passMiddleware);

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

      const response = await server.fetch(request, env);
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
