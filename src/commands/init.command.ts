import { mkdir } from 'node:fs/promises'
import { Artifact } from '../classes/Artifact.class.ts'

export default async function (args: string[], context: { flags: Record<string, string | boolean> }) {
    const root = `${process.cwd()}/${Artifact.ROOT}`

    await mkdir(root, { recursive: true })

    console.log(`Initialized ${Artifact.ROOT} at ${root}`)
    console.log(`Define an artifact at ${Artifact.ROOT}/<name>/${Artifact.DEFINITION}, then run: gstudio compile artifact <name>`)
}
