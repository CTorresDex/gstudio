import { Agent } from '../../classes/Agent.class.ts'
import { FeatureInstaller } from '../../classes/FeatureInstaller.class.ts'
import { Progress } from '../../classes/Progress.class.ts'

export const help = {
    short: 'Puts a feature, and what it requires, into this project',
    long: `Usage: gstudio add feature <name | alias/name | git-url> [--refresh] [--model <model>] [--effort <effort>]

Closes the graph of what the feature requires, checks every file and artifact it
would write for a collision, and only then writes anything. What it wrote is
recorded in .gstudio/project.json, with a hash per file.

Arguments:
  <name>       the feature, as a bare name, as <alias>/<name>, or as a git url

Flags:
  --refresh    re-fetch the source instead of reusing the cached clone
  --model      the model the llm steps run on
  --effort     the reasoning effort the llm steps run at`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio add feature <name | alias/name | git-url> [--refresh] [--model <model>] [--effort <effort>]')

    const added = await Progress.of(`Adding the feature ${args[0]}`).run((progress) => new FeatureInstaller(
        process.cwd(),
        new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined),
        (line) => progress.log(line),
    ).add(args[0]!, { refresh: context.flags.refresh === true }))

    if (added.promoted !== null) return console.log(`${added.promoted} was installed as a dependency; it is now yours, and stays when nothing else requires it`)
    if (added.installed.length === 0) return console.log(`${args[0]} is already installed`)

    console.log(`\nAdded ${added.installed.join(', ')}`)
}
