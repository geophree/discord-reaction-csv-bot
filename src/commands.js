/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

// https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-types
const MESSAGE_COMMAND = 3;

export const REACTION_CSV_COMMAND = {
  name: 'Get reactions as CSV',
  type: MESSAGE_COMMAND,
  description: '',
};

export const INVITE_COMMAND = {
  name: 'invite',
  description: 'Get an invite link to add the bot to your server',
};
