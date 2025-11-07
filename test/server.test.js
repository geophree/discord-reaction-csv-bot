import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  InteractionResponseType,
  InteractionType,
  InteractionResponseFlags,
} from 'discord-interactions';
import { AWW_COMMAND, INVITE_COMMAND } from '../src/commands.js';
import sinon from 'sinon';
import server from '../src/server.js';
import { redditUrl } from '../src/reddit.js';

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
    let verifyDiscordRequestStub;

    beforeEach(() => {
      verifyDiscordRequestStub = sinon.stub(server, 'verifyDiscordRequest');
    });

    afterEach(() => {
      verifyDiscordRequestStub.restore();
    });

    it('should handle a PING interaction', async (t) => {
      const interaction = {
        type: InteractionType.PING,
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {};

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(body.type, InteractionResponseType.PONG);
    });

    it('should handle an AWW command interaction', async (t) => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: AWW_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {};

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      // mock the fetch call to reddit
      const result = sinon
        // eslint-disable-next-line no-undef
        .stub(global, 'fetch')
        .withArgs(redditUrl)
        .resolves({
          status: 200,
          ok: true,
          json: sinon.fake.resolves({ data: { children: [] } }),
        });

      const response = await server.fetch(request, env);
      const body = await response.json();
      t.assert.strictEqual(
        body.type,
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      t.assert.ok(result.calledOnce);
    });

    it('should handle an invite command interaction', async (t) => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: INVITE_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {
        DISCORD_APPLICATION_ID: '123456789',
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

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
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'unknown',
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, {});
      const body = await response.json();
      t.assert.strictEqual(response.status, 400);
      t.assert.strictEqual(body.error, 'Unknown Type');
    });
  });

  describe('All other routes', () => {
    it('should return a "Not Found" response', async (t) => {
      const request = {
        method: 'GET',
        url: new URL('/unknown', 'http://discordo.example'),
      };
      const response = await server.fetch(request, {});
      t.assert.strictEqual(response.status, 404);
      const body = await response.text();
      t.assert.strictEqual(body, 'Not Found.');
    });
  });
});
