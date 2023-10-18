import { Stage } from 'aws-cdk-lib';
import { PipelineBase, PipelineBaseProps, StageDeployment, Wave, WaveOptions } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { AwsCredentialsProvider } from './aws-credentials';
import { DockerCredential } from './docker-credentials';
import { AddGitHubStageOptions } from './github-common';
import { GitHubWave } from './wave';
import * as github from './workflows-model';
import { YamlFile } from './yaml-file';
/**
 * Job level settings applied to all jobs in the workflow.
 */
export interface JobSettings {
    /**
     * jobs.<job_id>.if.
     *
     * @see https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idif
     */
    readonly if?: string;
}
/**
 * Props for `GitHubWorkflow`.
 */
export interface GitHubWorkflowProps extends PipelineBaseProps {
    /**
     * File path for the GitHub workflow.
     *
     * @default ".github/workflows/deploy.yml"
     */
    readonly workflowPath?: string;
    /**
     * Name of the workflow.
     *
     * @default "deploy"
     */
    readonly workflowName?: string;
    /**
     * GitHub workflow triggers.
     *
     * @default - By default, workflow is triggered on push to the `main` branch
     * and can also be triggered manually (`workflow_dispatch`).
     */
    readonly workflowTriggers?: github.WorkflowTriggers;
    /**
     * Version of the CDK CLI to use.
     * @default - automatic
     */
    readonly cdkCliVersion?: string;
    /**
     * Indicates if the repository already contains a synthesized `cdk.out` directory, in which
     * case we will simply checkout the repo in jobs that require `cdk.out`.
     *
     * @default false
     */
    readonly preSynthed?: boolean;
    /**
     * Configure provider for AWS credentials used for deployment.
     *
     * @default - Get AWS credentials from GitHub secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
     */
    readonly awsCreds?: AwsCredentialsProvider;
    /**
     * Names of GitHub repository secrets that include AWS credentials for
     * deployment.
     *
     * @default - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
     *
     * @deprecated Use `awsCreds.fromGitHubSecrets()` instead.
     */
    readonly awsCredentials?: AwsCredentialsSecrets;
    /**
     * A role that utilizes the GitHub OIDC Identity Provider in your AWS account.
     * If supplied, this will be used instead of `awsCredentials`.
     *
     * You can create your own role in the console with the necessary trust policy
     * to allow gitHub actions from your gitHub repository to assume the role, or
     * you can utilize the `GitHubActionRole` construct to create a role for you.
     *
     * @default - GitHub repository secrets are used instead of OpenId Connect role.
     *
     * @deprecated Use `awsCreds.fromOpenIdConnect()` instead.
     */
    readonly gitHubActionRoleArn?: string;
    /**
     * Build container options.
     *
     * @default - GitHub defaults
     */
    readonly buildContainer?: github.ContainerOptions;
    /**
     * GitHub workflow steps to execute before build.
     *
     * @default []
     */
    readonly preBuildSteps?: github.JobStep[];
    /**
     * GitHub workflow steps to execute after build.
     *
     * @default []
     */
    readonly postBuildSteps?: github.JobStep[];
    /**
     * The Docker Credentials to use to login. If you set this variable,
     * you will be logged in to docker when you upload Docker Assets.
     */
    readonly dockerCredentials?: DockerCredential[];
    /**
     * The type of runner to run the job on. The runner can be either a
     * GitHub-hosted runner or a self-hosted runner.
     *
     * @default Runner.UBUNTU_LATEST
     */
    readonly runner?: github.Runner;
    /**
     * Will assume the GitHubActionRole in this region when publishing assets.
     * This is NOT the region in which the assets are published.
     *
     * In most cases, you do not have to worry about this property, and can safely
     * ignore it.
     *
     * @default "us-west-2"
     */
    readonly publishAssetsAuthRegion?: string;
    /**
     * Job level settings that will be applied to all jobs in the workflow,
     * including synth and asset deploy jobs. Currently the only valid setting
     * is 'if'. You can use this to run jobs only in specific repositories.
     *
     * @see https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#example-only-run-job-for-specific-repository
     */
    readonly jobSettings?: JobSettings;
}
/**
 * CDK Pipelines for GitHub workflows.
 */
export declare class GitHubWorkflow extends PipelineBase {
    readonly workflowPath: string;
    readonly workflowName: string;
    readonly workflowFile: YamlFile;
    private readonly workflowTriggers;
    private readonly preSynthed;
    private readonly awsCredentials;
    private readonly dockerCredentials;
    private readonly cdkCliVersion?;
    private readonly buildContainer?;
    private readonly preBuildSteps;
    private readonly postBuildSteps;
    private readonly jobOutputs;
    private readonly assetHashMap;
    private readonly runner;
    private readonly publishAssetsAuthRegion;
    private readonly stackProperties;
    private readonly jobSettings?;
    private builtGH;
    constructor(scope: Construct, id: string, props: GitHubWorkflowProps);
    /**
     * Parse AWS credential configuration from deprecated properties For backwards compatibility.
     */
    private getAwsCredentials;
    /**
     * Deploy a single Stage by itself with options for further GitHub configuration.
     *
     * Add a Stage to the pipeline, to be deployed in sequence with other Stages added to the pipeline.
     * All Stacks in the stage will be deployed in an order automatically determined by their relative dependencies.
     */
    addStageWithGitHubOptions(stage: Stage, options?: AddGitHubStageOptions): StageDeployment;
    /**
     * Add a Wave to the pipeline, for deploying multiple Stages in parallel
     *
     * Use the return object of this method to deploy multiple stages in parallel.
     *
     * Example:
     *
     * ```ts
     * declare const pipeline: GitHubWorkflow; // assign pipeline a value
     *
     * const wave = pipeline.addWave('MyWave');
     * wave.addStage(new MyStage(this, 'Stage1'));
     * wave.addStage(new MyStage(this, 'Stage2'));
     * ```
     */
    addWave(id: string, options?: WaveOptions): Wave;
    addGitHubWave(id: string, options?: WaveOptions): GitHubWave;
    /**
     * Support adding stages with GitHub options to waves - should ONLY be called internally.
     *
     * Use `pipeline.addWave()` and it'll call this when `wave.addStage()` is called.
     *
     * `pipeline.addStage()` will also call this, since it calls `pipeline.addWave().addStage()`.
     *
     *  @internal
     */
    _addStageFromWave(stage: Stage, stageDeployment: StageDeployment, options?: AddGitHubStageOptions): void;
    private addStackProps;
    protected doBuildPipeline(): void;
    private insertJobOutputs;
    private renderJobOutputs;
    /**
     * Make an action from the given node and/or step
     */
    private jobForNode;
    private jobForAssetPublish;
    private jobForDeploy;
    private jobForBuildStep;
    /**
     * Searches for the stack that produced the output via the current
     * job's dependencies.
     *
     * This function should always find a stack, since it is guaranteed
     * that a CfnOutput comes from a referenced stack.
     */
    private findStackOfOutput;
    private addJobOutput;
    private jobForScriptStep;
    private jobForGitHubActionStep;
    private stepsToConfigureAws;
    private stepsToConfigureDocker;
    private stepsToDownloadAssembly;
    private stepsToCheckout;
    private stepsToUploadAssembly;
    private renderDependencies;
    private renderJobSettingParameters;
    private renderGitHubEnvironment;
}
/**
 * Names of secrets for AWS credentials.
 */
export interface AwsCredentialsSecrets {
    /**
     * @default "AWS_ACCESS_KEY_ID"
     */
    readonly accessKeyId?: string;
    /**
     * @default "AWS_SECRET_ACCESS_KEY"
     */
    readonly secretAccessKey?: string;
    /**
     * @default - no session token is used
     */
    readonly sessionToken?: string;
}
export declare function flatten<A>(xs: Iterable<A[]>): IterableIterator<A>;
