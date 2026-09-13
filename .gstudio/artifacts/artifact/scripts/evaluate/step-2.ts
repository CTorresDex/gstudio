#!/usr/bin/env bun
import { pathToFileURL } from 'node:url'

const EXTENSIONS: Record<string, string> = {
    sh: 'sh', bash: 'sh', zsh: 'sh', ts: 'ts', typescript: 'ts', js: 'js', javascript: 'js', py: 'py', python: 'py',
}

async function main() {
    const name = process.argv[2]

    if (!name) {
        console.error('Error: artifact name is required')
        process.exit(1)
    }

    const cwd = process.cwd()
    const { Artifact } = await import(pathToFileURL(`${cwd}/src/classes/Artifact.class.ts`).href)
    const { ArtifactCompiler } = await import(pathToFileURL(`${cwd}/src/classes/ArtifactCompiler.class.ts`).href)

    const compileCommand = `bun run index.ts compile artifact ${name}`
    const discrepancies: string[] = []

    const definitionPath = Artifact.path(name, cwd)
    const definitionFile = Bun.file(definitionPath)

    if (!(await definitionFile.exists())) {
        console.log(`The definition file does not exist at ${definitionPath}.`)
        process.exit(1)
    }

    const source = await definitionFile.text()
    const firstLine = (source.split('\n')[0] ?? '').replace(/\r$/, '')
    const idMatch = /^ID:\s*(.+)$/.exec(firstLine)

    if (!idMatch || idMatch[1].trim() === '') {
        discrepancies.push(`The first line must be "ID: {id}" with a non-empty id, found "${firstLine}".`)
    }

    let artifact: any = null

    try {
        artifact = Artifact.parse(name, source)
    } catch (error) {
        discrepancies.push(`The definition does not parse: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (artifact) {
        for (const action of artifact.actions) {
            if (action.steps[0]?.kind !== 'llm') {
                discrepancies.push(`Action "${action.name}": the first step must be an <llm> step.`)
            }
        }

        const manifestPath = `${cwd}/${Artifact.ROOT}/${artifact.name}/${ArtifactCompiler.MANIFEST}`
        const manifestFile = Bun.file(manifestPath)

        if (!(await manifestFile.exists())) {
            discrepancies.push(`No manifest found at ${manifestPath}. Run \`${compileCommand}\` to compile the artifact.`)
        } else {
            let manifest: { steps?: Record<string, { hash: string }>; descriptions?: Record<string, { hash: string }> } | null = null

            try {
                manifest = await manifestFile.json()
            } catch {
                discrepancies.push(`The manifest at ${manifestPath} is not valid JSON. Run \`${compileCommand}\` to recompile the artifact.`)
            }

            if (manifest) {
                for (const action of artifact.actions) {
                    for (const [index, step] of action.steps.entries()) {
                        if (step.kind !== 'deterministic') continue

                        const extension = EXTENSIONS[(step.lang ?? 'sh').toLowerCase()] ?? 'sh'
                        const scriptPath = `${Artifact.ROOT}/${artifact.name}/${ArtifactCompiler.SCRIPTS}/${action.name}/step-${index + 1}.${extension}`
                        const entry = manifest.steps?.[scriptPath]

                        if (!entry || entry.hash !== step.hash) {
                            discrepancies.push(`Step "${scriptPath}" has no up-to-date manifest entry. Run \`${compileCommand}\` to compile the artifact.`)
                        } else if (!(await Bun.file(`${cwd}/${scriptPath}`).exists())) {
                            discrepancies.push(`Script ${scriptPath} is listed in the manifest but does not exist on disk. Run \`${compileCommand}\` to compile the artifact.`)
                        }
                    }

                    const descriptionHash = new Bun.CryptoHasher('sha256')
                        .update(`${artifact.name}\0${artifact.rules}\0${action.source}`)
                        .digest('hex')
                    const description = manifest.descriptions?.[action.name]

                    if (!description || description.hash !== descriptionHash) {
                        discrepancies.push(`Action "${action.name}" has no up-to-date manifest description. Run \`${compileCommand}\` to compile the artifact.`)
                    }

                    for (const target of ArtifactCompiler.TARGETS) {
                        const skillPath = `${target}/skills/${action.name}-${artifact.name}/SKILL.md`

                        if (!(await Bun.file(`${cwd}/${skillPath}`).exists())) {
                            discrepancies.push(`Skill file ${skillPath} does not exist. Run \`${compileCommand}\` to compile the artifact.`)
                        }
                    }
                }
            }
        }
    }

    if (discrepancies.length > 0) {
        for (const discrepancy of discrepancies) console.log(discrepancy)
        process.exit(1)
    }

    console.log(`Artifact "${name}" complies with all rules and is fully compiled.`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
})
