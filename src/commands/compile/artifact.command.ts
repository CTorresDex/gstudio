import { Artifact } from '../../classes/Artifact.class.ts'
import { ArtifactCompiler } from '../../classes/ArtifactCompiler.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    if (args[0] === undefined) throw new Error('Usage: gstudio compile artifact <name> [--model <model>] [--effort <effort>]')

    const { skills, removed } = await new ArtifactCompiler({
        model: typeof context.flags.model === 'string' ? context.flags.model : undefined,
        effort: typeof context.flags.effort === 'string' ? context.flags.effort : undefined,
    }).compile(await Artifact.load(args[0]))

    for (const skill of skills) {
        console.log(skill.name)

        for (const path of skill.built) console.log(`  built    ${path}`)
        for (const path of skill.reused) console.log(`  reused   ${path}`)
        for (const path of skill.targets) console.log(`  skill    ${path}`)
    }

    for (const path of removed) console.log(`  removed  ${path}`)
}
