#!/usr/bin/env bun
import { CLI } from './src/classes/CLI.class.ts'

CLI.run().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
