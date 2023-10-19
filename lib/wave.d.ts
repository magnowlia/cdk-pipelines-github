import { Stage } from 'aws-cdk-lib';
import { AddStageOpts, StageDeployment, Wave, WaveProps } from 'aws-cdk-lib/pipelines';
import { AddGitHubStageOptions } from './github-common';
import { GitHubWorkflow } from './pipeline';
/**
 * Multiple stages that are deployed in parallel
 *
 * A `Wave`, but with addition GitHub options
 *
 * Create with `GitHubWorkflow.addWave()` or `GitHubWorkflow.addGitHubWave()`.
 * You should not have to instantiate a GitHubWave yourself.
 */
export declare class GitHubWave extends Wave {
    /** Identifier for this Wave */
    readonly id: string;
    /** GitHubWorkflow that this wave is part of  */
    private pipeline;
    /**
     * Create with `GitHubWorkflow.addWave()` or `GitHubWorkflow.addGitHubWave()`.
     * You should not have to instantiate a GitHubWave yourself.
     */
    constructor(
    /** Identifier for this Wave */
    id: string, 
    /** GitHubWorkflow that this wave is part of  */
    pipeline: GitHubWorkflow, props?: WaveProps);
    /**
     * Add a Stage to this wave
     *
     * It will be deployed in parallel with all other stages in this
     * wave.
     */
    addStage(stage: Stage, options?: AddStageOpts): StageDeployment;
    /**
     * Add a Stage to this wave
     *
     * It will be deployed in parallel with all other stages in this
     * wave.
     */
    addStageWithGitHubOptions(stage: Stage, options?: AddGitHubStageOptions): StageDeployment;
}
