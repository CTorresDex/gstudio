import { Agent } from '../../classes/Agent.class.ts'
import { Artifact } from '../../classes/Artifact.class.ts'
import { ArtifactCompiler } from '../../classes/ArtifactCompiler.class.ts'

export const help = {
    short: 'Compiles one artifact into the skills its actions become',
    long: `Usage: gstudio compile artifact <name> [--model <model>] [--effort <effort>]

Writes a script per deterministic step and a skill per action, at every target.
compiled.json keys every step by hash, so only what changed is rebuilt.

Arguments:
  <name>       the artifact, as it is named under .gstudio/artifacts

Flags:
  --model      the model the compiler writes scripts with
  --effort     the reasoning effort it writes them at`,
}

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio compile artifact <name> [--model <model>] [--effort <effort>]')

    const { skills, removed } = await new ArtifactCompiler({
        agent: new Agent(typeof context.flags.model === 'string' ? context.flags.model : undefined, typeof context.flags.effort === 'string' ? context.flags.effort : undefined),
    }).compile(await Artifact.load(args[0]))

    for (const skill of skills) {
        console.log(skill.name)

        for (const path of skill.built) console.log(`  built    ${path}`)
        for (const path of skill.reused) console.log(`  reused   ${path}`)
        for (const path of skill.targets) console.log(`  skill    ${path}`)
    }

    for (const path of removed) console.log(`  removed  ${path}`)
}
