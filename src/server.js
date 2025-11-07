/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter, json } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { REACTION_CSV_COMMAND, INVITE_COMMAND } from './commands.js';

async function discordMiddleware(req, env) {
  const expressReq = {
    body: await req.text(),
    header: (name) => req.headers.get(name),
  };

  const res = { headers: {} };
  const expressRes = {
    setHeader: (key, val) => (res.headers[key] = val),
    end: (val) => (res.body = val),
  };

  let isValid = false;
  const next = () => (isValid = true);

  await server.verifyKeyMiddleware(env.DISCORD_PUBLIC_KEY)(
    expressReq,
    expressRes,
    next,
  );

  if (!isValid) {
    res.status = expressRes.statusCode;
    return new Response(res.body, res);
  }

  req.interaction = expressReq.body;
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
router.post('/', discordMiddleware, async (req, env) => {
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
  verifyKeyMiddleware,
  fetch: router.fetch,
};

export default server;
