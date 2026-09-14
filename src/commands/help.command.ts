import { Help } from '../classes/Help.class.ts'

export const help = {
    short: 'Shows every command there is, or the detailed help of one',
    long: `Usage: gstudio help [<command>]

With no command, prints every command there is with the one line it describes
itself by — the same text gstudio prints when given no arguments at all.

With a command, prints its detailed help: the usage line, what it does, its
arguments and its flags. Words that name no command but begin the paths of some
are taken as a filter, so \`gstudio help compile\` lists every compile command.

Arguments:
  <command>    the command, typed as it is typed to run it (compile artifact)`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    console.log(await Help.of(args))
}
