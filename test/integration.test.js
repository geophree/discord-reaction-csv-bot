import { describe, it, beforeEach } from 'node:test';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
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
  return new Request(makePostRequest(bodyObj), {
    headers: {
      'X-Signature-Timestamp': '2025-11-06T21:41:40Z',
      'X-Signature-Ed25519': hexSignature,
    },
  });
}

describe('Integration', () => {
  describe('POST /', () => {
    let env;

    beforeEach(() => {
      env = {
        DISCORD_PUBLIC_KEY: TEST_PUBLIC_KEY_HEX,
        DISCORD_APPLICATION_ID: '123456789',
      };
    });

    it('should reject an unverifiable request', async (t) => {
      const request = makePostRequest({
        type: InteractionType.PING,
      });

      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, '[discordMiddleware] Invalid signature');
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

      const response = await server.fetch(request, env);
      t.assert.strictEqual(response.status, 401);
      const body = await response.text();
      t.assert.strictEqual(body, '[discordMiddleware] Invalid signature');
    });

    it('should handle a PING interaction', async (t) => {
      const request = await makeSignedPostRequest({
        type: InteractionType.PING,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(body.type, InteractionResponseType.PONG);
    });
  });
});
