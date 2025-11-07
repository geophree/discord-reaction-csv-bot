/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter, json } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
  //  verifyKeyMiddleware
} from 'discord-interactions';
import { REACTION_CSV_COMMAND, INVITE_COMMAND } from './commands.js';

async function verifyKeyMiddleware(req, env) {
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');
  const body = await req.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await server.verifyKey(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY,
    ));

  if (!isValidRequest) {
    return new Response('Bad request signature.', { status: 401 });
  }

  try {
    req.interaction = JSON.parse(body) || {};
  } catch {
    return new Response('Bad request json format.', { status: 401 });
  }

  if (req.interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return { type: InteractionResponseType.PONG };
  }
}

const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (req, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', verifyKeyMiddleware, async (req, env) => {
  const interaction = req.interaction;

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    const command = interaction.data.name.toLowerCase();
    switch (command) {
      case REACTION_CSV_COMMAND.name.toLowerCase(): {
        const cuteUrl = 'https://cute.com';
        return {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: cuteUrl,
          },
        };
      }
      case INVITE_COMMAND.name.toLowerCase(): {
        const applicationId = env.DISCORD_APPLICATION_ID;
        const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;
        return {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: INVITE_URL,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        };
      }
      default:
        return json({ error: `Unknown Command: ${command}` }, { status: 400 });
    }
  }

  const error = `Unknown Interaction Type: ${interaction.type}`;
  console.error(error);
  return json({ error }, { status: 400 });
});

const server = {
  verifyKey,
  fetch: router.fetch,
};

export default server;
