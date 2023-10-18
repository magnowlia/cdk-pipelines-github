"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.flatten = exports.GitHubWorkflow = void 0;
const JSII_RTTI_SYMBOL_1 = Symbol.for("jsii.rtti");
const fs_1 = require("fs");
const path = require("path");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cx_api_1 = require("aws-cdk-lib/cx-api");
const pipelines_1 = require("aws-cdk-lib/pipelines");
const helpers_internal_1 = require("aws-cdk-lib/pipelines/lib/helpers-internal");
const decamelize = require("decamelize");
const aws_credentials_1 = require("./aws-credentials");
const stage_1 = require("./stage");
const github_action_step_1 = require("./steps/github-action-step");
const wave_1 = require("./wave");
const github = require("./workflows-model");
const yaml_file_1 = require("./yaml-file");
const CDKOUT_ARTIFACT = 'cdk.out';
const ASSET_HASH_NAME = 'asset-hash';
/**
 * CDK Pipelines for GitHub workflows.
 */
class GitHubWorkflow extends pipelines_1.PipelineBase {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.jobOutputs = {};
        this.assetHashMap = {};
        this.stackProperties = {};
        // in order to keep track of if this pipeline has been built so we can
        // catch later calls to addWave() or addStage()
        this.builtGH = false;
        this.cdkCliVersion = props.cdkCliVersion;
        this.preSynthed = props.preSynthed ?? false;
        this.buildContainer = props.buildContainer;
        this.preBuildSteps = props.preBuildSteps ?? [];
        this.postBuildSteps = props.postBuildSteps ?? [];
        this.jobSettings = props.jobSettings;
        this.awsCredentials = this.getAwsCredentials(props);
        this.dockerCredentials = props.dockerCredentials ?? [];
        this.workflowPath = props.workflowPath ?? '.github/workflows/deploy.yml';
        if (!this.workflowPath.endsWith('.yml') && !this.workflowPath.endsWith('.yaml')) {
            throw new Error('workflow file is expected to be a yaml file');
        }
        if (!this.workflowPath.includes('.github/workflows/')) {
            throw new Error('workflow files must be stored in the \'.github/workflows\' directory of your repository');
        }
        this.workflowFile = new yaml_file_1.YamlFile(this.workflowPath);
        this.workflowName = props.workflowName ?? 'deploy';
        this.workflowTriggers = props.workflowTriggers ?? {
            push: { branches: ['main'] },
            workflowDispatch: {},
        };
        this.runner = props.runner ?? github.Runner.UBUNTU_LATEST;
        this.publishAssetsAuthRegion = props.publishAssetsAuthRegion ?? 'us-west-2';
    }
    /**
     * Parse AWS credential configuration from deprecated properties For backwards compatibility.
     */
    getAwsCredentials(props) {
        if (props.gitHubActionRoleArn) {
            if (props.awsCreds) {
                throw new Error('Please provide only one method of authentication (remove githubActionRoleArn)');
            }
            return aws_credentials_1.AwsCredentials.fromOpenIdConnect({
                gitHubActionRoleArn: props.gitHubActionRoleArn,
            });
        }
        if (props.awsCredentials) {
            if (props.awsCreds) {
                throw new Error('Please provide only one method of authentication (remove awsCredentials)');
            }
            return aws_credentials_1.AwsCredentials.fromGitHubSecrets({
                accessKeyId: 'AWS_ACCESS_KEY_ID',
                secretAccessKey: 'AWS_SECRET_ACCESS_KEY',
                ...props.awsCredentials,
            });
        }
        return props.awsCreds ?? aws_credentials_1.AwsCredentials.fromGitHubSecrets();
    }
    /**
     * Deploy a single Stage by itself with options for further GitHub configuration.
     *
     * Add a Stage to the pipeline, to be deployed in sequence with other Stages added to the pipeline.
     * All Stacks in the stage will be deployed in an order automatically determined by their relative dependencies.
     */
    addStageWithGitHubOptions(stage, options) {
        const stageDeployment = this.addStage(stage, options);
        // keep track of GitHub specific options
        const stacks = stageDeployment.stacks;
        this.addStackProps(stacks, 'environment', options?.gitHubEnvironment);
        this.addStackProps(stacks, 'capabilities', options?.stackCapabilities);
        this.addStackProps(stacks, 'settings', options?.jobSettings);
        return stageDeployment;
    }
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
    addWave(id, options) {
        return this.addGitHubWave(id, options);
    }
    addGitHubWave(id, options) {
        if (this.builtGH) {
            throw new Error("addWave: can't add Waves anymore after buildPipeline() has been called");
        }
        const wave = new wave_1.GitHubWave(id, this, options);
        this.waves.push(wave);
        return wave;
    }
    /**
     * Support adding stages with GitHub options to waves - should ONLY be called internally.
     *
     * Use `pipeline.addWave()` and it'll call this when `wave.addStage()` is called.
     *
     * `pipeline.addStage()` will also call this, since it calls `pipeline.addWave().addStage()`.
     *
     *  @internal
     */
    _addStageFromWave(stage, stageDeployment, options) {
        if (!(stage instanceof stage_1.GitHubStage) && options === undefined) {
            return;
        }
        const ghStage = stage instanceof stage_1.GitHubStage ? stage : undefined;
        // keep track of GitHub specific options
        const stacks = stageDeployment.stacks;
        this.addStackProps(stacks, 'environment', ghStage?.props?.gitHubEnvironment ?? options?.gitHubEnvironment);
        this.addStackProps(stacks, 'capabilities', ghStage?.props?.stackCapabilities ?? options?.stackCapabilities);
        this.addStackProps(stacks, 'settings', ghStage?.props?.jobSettings ?? options?.jobSettings);
    }
    addStackProps(stacks, key, value) {
        if (value === undefined) {
            return;
        }
        for (const stack of stacks) {
            this.stackProperties[stack.stackArtifactId] = {
                ...this.stackProperties[stack.stackArtifactId],
                [key]: value,
            };
        }
    }
    doBuildPipeline() {
        this.builtGH = true;
        const app = aws_cdk_lib_1.Stage.of(this);
        if (!app) {
            throw new Error('The GitHub Workflow must be defined in the scope of an App');
        }
        const cdkoutDir = app.outdir;
        const jobs = new Array();
        const structure = new helpers_internal_1.PipelineGraph(this, {
            selfMutation: false,
            publishTemplate: true,
            prepareStep: false,
        });
        for (const stageNode of flatten(structure.graph.sortedChildren())) {
            if (!helpers_internal_1.isGraph(stageNode)) {
                throw new Error(`Top-level children must be graphs, got '${stageNode}'`);
            }
            const tranches = stageNode.sortedLeaves();
            for (const tranche of tranches) {
                for (const node of tranche) {
                    const job = this.jobForNode(node, {
                        assemblyDir: cdkoutDir,
                        structure,
                    });
                    if (job) {
                        jobs.push(job);
                    }
                }
            }
        }
        // convert jobs to a map and make sure there are no duplicates
        const jobmap = {};
        for (const job of jobs) {
            if (job.id in jobmap) {
                throw new Error(`duplicate job id ${job.id}`);
            }
            jobmap[job.id] = snakeCaseKeys(job.definition);
        }
        // Update jobs with late-bound output requests
        this.insertJobOutputs(jobmap);
        const workflow = {
            name: this.workflowName,
            on: snakeCaseKeys(this.workflowTriggers, '_'),
            jobs: jobmap,
        };
        // write as a yaml file
        this.workflowFile.update(workflow);
        // create directory if it does not exist
        fs_1.mkdirSync(path.dirname(this.workflowPath), { recursive: true });
        // GITHUB_WORKFLOW is set when GitHub Actions is running the workflow.
        // see: https://docs.github.com/en/actions/learn-github-actions/environment-variables#default-environment-variables
        const contextValue = this.node.tryGetContext('cdk-pipelines-github:diffProtection');
        const diffProtection = contextValue === 'false' ? false : contextValue ?? true;
        if (diffProtection && process.env.GITHUB_WORKFLOW === this.workflowName) {
            // check if workflow file has changed
            if (!fs_1.existsSync(this.workflowPath) || this.workflowFile.toYaml() !== fs_1.readFileSync(this.workflowPath, 'utf8')) {
                throw new Error(`Please commit the updated workflow file ${path.relative(__dirname, this.workflowPath)} when you change your pipeline definition.`);
            }
        }
        this.workflowFile.writeFile();
    }
    insertJobOutputs(jobmap) {
        for (const [jobId, jobOutputs] of Object.entries(this.jobOutputs)) {
            jobmap[jobId] = {
                ...jobmap[jobId],
                outputs: {
                    ...jobmap[jobId].outputs,
                    ...this.renderJobOutputs(jobOutputs),
                },
            };
        }
    }
    renderJobOutputs(outputs) {
        const renderedOutputs = {};
        for (const output of outputs) {
            renderedOutputs[output.outputName] = `\${{ steps.${output.stepId}.outputs.${output.outputName} }}`;
        }
        return renderedOutputs;
    }
    /**
     * Make an action from the given node and/or step
     */
    jobForNode(node, options) {
        switch (node.data?.type) {
            // Nothing for these, they are groupings (shouldn't even have popped up here)
            case 'group':
            case 'stack-group':
            case undefined:
                throw new Error(`jobForNode: did not expect to get group nodes: ${node.data?.type}`);
            case 'self-update':
                throw new Error('GitHub Workflows does not support self mutation');
            case 'publish-assets':
                return this.jobForAssetPublish(node, node.data.assets, options);
            case 'prepare':
                throw new Error('"prepare" is not supported by GitHub Workflows');
            case 'execute':
                return this.jobForDeploy(node, node.data.stack, node.data.captureOutputs);
            case 'step':
                if (node.data.isBuildStep) {
                    return this.jobForBuildStep(node, node.data.step);
                }
                else if (node.data.step instanceof pipelines_1.ShellStep) {
                    return this.jobForScriptStep(node, node.data.step);
                }
                else if (node.data.step instanceof github_action_step_1.GitHubActionStep) {
                    return this.jobForGitHubActionStep(node, node.data.step);
                }
                else {
                    throw new Error(`unsupported step type: ${node.data.step.constructor.name}`);
                }
            default:
                // The 'as any' is temporary, until the change upstream rolls out
                throw new Error(`GitHubWorfklow does not support graph nodes of type '${node.data?.type}'. You are probably using a feature this CDK Pipelines implementation does not support.`);
        }
    }
    jobForAssetPublish(node, assets, options) {
        if (assets.length === 0) {
            throw new Error('Asset Publish step must have at least 1 asset');
        }
        const installSuffix = this.cdkCliVersion ? `@${this.cdkCliVersion}` : '';
        const cdkoutDir = options.assemblyDir;
        const jobId = node.uniqueId;
        const assetId = assets[0].assetId;
        // check if asset is docker asset and if we have docker credentials
        const dockerLoginSteps = [];
        if (node.uniqueId.includes('DockerAsset') && this.dockerCredentials.length > 0) {
            for (const creds of this.dockerCredentials) {
                dockerLoginSteps.push(...this.stepsToConfigureDocker(creds));
            }
        }
        // create one file and make one step
        const relativeToAssembly = (p) => path.posix.join(cdkoutDir, path.relative(path.resolve(cdkoutDir), p));
        const fileContents = ['set -ex'].concat(assets.map((asset) => {
            return `npx cdk-assets --path "${relativeToAssembly(asset.assetManifestPath)}" --verbose publish "${asset.assetSelector}"`;
        }));
        // we need the jobId to reference the outputs later
        this.assetHashMap[assetId] = jobId;
        fileContents.push(`echo '${ASSET_HASH_NAME}=${assetId}' >> $GITHUB_OUTPUT`);
        const publishStepFile = path.join(cdkoutDir, `publish-${aws_cdk_lib_1.Names.uniqueId(this)}-${jobId}-step.sh`);
        fs_1.mkdirSync(path.dirname(publishStepFile), { recursive: true });
        fs_1.writeFileSync(publishStepFile, fileContents.join('\n'), { encoding: 'utf-8' });
        const publishStep = {
            id: 'Publish',
            name: `Publish ${jobId}`,
            run: `/bin/bash ./cdk.out/${path.relative(cdkoutDir, publishStepFile)}`,
        };
        return {
            id: jobId,
            definition: {
                name: `Publish Assets ${jobId}`,
                ...this.renderJobSettingParameters(),
                needs: this.renderDependencies(node),
                permissions: {
                    contents: github.JobPermission.READ,
                    idToken: this.awsCredentials.jobPermission(),
                },
                runsOn: this.runner.runsOn,
                outputs: {
                    [ASSET_HASH_NAME]: `\${{ steps.Publish.outputs.${ASSET_HASH_NAME} }}`,
                },
                steps: [
                    ...this.stepsToDownloadAssembly(cdkoutDir),
                    {
                        name: 'Install',
                        run: `npm install --no-save cdk-assets${installSuffix}`,
                    },
                    ...this.stepsToConfigureAws(this.publishAssetsAuthRegion),
                    ...dockerLoginSteps,
                    publishStep,
                ],
            },
        };
    }
    jobForDeploy(node, stack, _captureOutputs) {
        const region = stack.region;
        const account = stack.account;
        if (!region || !account) {
            throw new Error('"account" and "region" are required');
        }
        if (!stack.templateUrl) {
            throw new Error(`unable to determine template URL for stack ${stack.stackArtifactId}`);
        }
        const resolve = (s) => {
            return cx_api_1.EnvironmentPlaceholders.replace(s, {
                accountId: account,
                region: region,
                partition: 'aws',
            });
        };
        const replaceAssetHash = (template) => {
            const hash = path.parse(template.split('/').pop() ?? '').name;
            if (this.assetHashMap[hash] === undefined) {
                throw new Error(`Template asset hash ${hash} not found.`);
            }
            return template.replace(hash, `\${{ needs.${this.assetHashMap[hash]}.outputs.${ASSET_HASH_NAME} }}`);
        };
        const params = {
            'name': stack.stackName,
            'template': replaceAssetHash(resolve(stack.templateUrl)),
            'no-fail-on-empty-changeset': '1',
        };
        const capabilities = this.stackProperties[stack.stackArtifactId]?.capabilities;
        if (capabilities) {
            params.capabilities = Array(capabilities).join(',');
        }
        if (stack.executionRoleArn) {
            params['role-arn'] = resolve(stack.executionRoleArn);
        }
        const assumeRoleArn = stack.assumeRoleArn ? resolve(stack.assumeRoleArn) : undefined;
        return {
            id: node.uniqueId,
            definition: {
                name: `Deploy ${stack.stackArtifactId}`,
                ...this.renderJobSettingParameters(),
                ...this.stackProperties[stack.stackArtifactId]?.settings,
                permissions: {
                    contents: github.JobPermission.READ,
                    idToken: this.awsCredentials.jobPermission(),
                },
                ...this.renderGitHubEnvironment(this.stackProperties[stack.stackArtifactId]?.environment),
                needs: this.renderDependencies(node),
                runsOn: this.runner.runsOn,
                steps: [
                    ...this.stepsToConfigureAws(region, assumeRoleArn),
                    {
                        id: 'Deploy',
                        uses: 'aws-actions/aws-cloudformation-github-deploy@v1.2.0',
                        with: params,
                    },
                ],
            },
        };
    }
    jobForBuildStep(node, step) {
        if (!(step instanceof pipelines_1.ShellStep)) {
            throw new Error('synthStep must be a ScriptStep');
        }
        if (step.inputs.length > 0) {
            throw new Error('synthStep cannot have inputs');
        }
        if (step.outputs.length > 1) {
            throw new Error('synthStep must have a single output');
        }
        if (!step.primaryOutput) {
            throw new Error('synthStep requires a primaryOutput which contains cdk.out');
        }
        const cdkOut = step.outputs[0];
        const installSteps = step.installCommands.length > 0 ? [{
                name: 'Install',
                run: step.installCommands.join('\n'),
            }] : [];
        return {
            id: node.uniqueId,
            definition: {
                name: 'Synthesize',
                ...this.renderJobSettingParameters(),
                permissions: {
                    contents: github.JobPermission.READ,
                    // The Synthesize job does not use the GitHub Action Role on its own, but it's possible
                    // that it is being used in the preBuildSteps.
                    idToken: this.awsCredentials.jobPermission(),
                },
                runsOn: this.runner.runsOn,
                needs: this.renderDependencies(node),
                env: step.env,
                container: this.buildContainer,
                steps: [
                    ...this.stepsToCheckout(),
                    ...this.preBuildSteps,
                    ...installSteps,
                    {
                        name: 'Build',
                        run: step.commands.join('\n'),
                    },
                    ...this.postBuildSteps,
                    ...this.stepsToUploadAssembly(cdkOut.directory),
                ],
            },
        };
    }
    /**
     * Searches for the stack that produced the output via the current
     * job's dependencies.
     *
     * This function should always find a stack, since it is guaranteed
     * that a CfnOutput comes from a referenced stack.
     */
    findStackOfOutput(ref, node) {
        for (const dep of node.allDeps) {
            if (dep.data?.type === 'execute' && ref.isProducedBy(dep.data.stack)) {
                return dep.uniqueId;
            }
        }
        // Should never happen
        throw new Error(`The output ${ref.outputName} is not referenced by any of the dependent stacks!`);
    }
    addJobOutput(jobId, output) {
        if (this.jobOutputs[jobId] === undefined) {
            this.jobOutputs[jobId] = [output];
        }
        else {
            this.jobOutputs[jobId].push(output);
        }
    }
    jobForScriptStep(node, step) {
        const envVariables = {};
        for (const [envName, ref] of Object.entries(step.envFromCfnOutputs)) {
            const jobId = this.findStackOfOutput(ref, node);
            this.addJobOutput(jobId, {
                outputName: ref.outputName,
                stepId: 'Deploy',
            });
            envVariables[envName] = `\${{ needs.${jobId}.outputs.${ref.outputName} }}`;
        }
        const downloadInputs = new Array();
        const uploadOutputs = new Array();
        for (const input of step.inputs) {
            downloadInputs.push({
                uses: 'actions/download-artifact@v3',
                with: {
                    name: input.fileSet.id,
                    path: input.directory,
                },
            });
        }
        for (const output of step.outputs) {
            uploadOutputs.push({
                uses: 'actions/upload-artifact@v3',
                with: {
                    name: output.fileSet.id,
                    path: output.directory,
                },
            });
        }
        const installSteps = step.installCommands.length > 0 ? [{
                name: 'Install',
                run: step.installCommands.join('\n'),
            }] : [];
        return {
            id: node.uniqueId,
            definition: {
                name: step.id,
                ...this.renderJobSettingParameters(),
                permissions: {
                    contents: github.JobPermission.READ,
                },
                runsOn: this.runner.runsOn,
                needs: this.renderDependencies(node),
                env: {
                    ...step.env,
                    ...envVariables,
                },
                steps: [
                    ...downloadInputs,
                    ...installSteps,
                    { run: step.commands.join('\n') },
                    ...uploadOutputs,
                ],
            },
        };
    }
    jobForGitHubActionStep(node, step) {
        return {
            id: node.uniqueId,
            definition: {
                name: step.id,
                ...this.renderJobSettingParameters(),
                permissions: {
                    contents: github.JobPermission.WRITE,
                },
                runsOn: this.runner.runsOn,
                needs: this.renderDependencies(node),
                env: step.env,
                steps: step.jobSteps,
            },
        };
    }
    stepsToConfigureAws(region, assumeRoleArn) {
        return this.awsCredentials.credentialSteps(region, assumeRoleArn);
    }
    stepsToConfigureDocker(dockerCredential) {
        let params;
        if (dockerCredential.name === 'docker') {
            params = {
                username: `\${{ secrets.${dockerCredential.usernameKey} }}`,
                password: `\${{ secrets.${dockerCredential.passwordKey} }}`,
            };
        }
        else if (dockerCredential.name === 'ecr') {
            params = {
                registry: dockerCredential.registry,
            };
        }
        else {
            params = {
                registry: dockerCredential.registry,
                username: `\${{ secrets.${dockerCredential.usernameKey} }}`,
                password: `\${{ secrets.${dockerCredential.passwordKey} }}`,
            };
        }
        return [
            {
                uses: 'docker/login-action@v2',
                with: params,
            },
        ];
    }
    stepsToDownloadAssembly(targetDir) {
        if (this.preSynthed) {
            return this.stepsToCheckout();
        }
        return [{
                name: `Download ${CDKOUT_ARTIFACT}`,
                uses: 'actions/download-artifact@v3',
                with: {
                    name: CDKOUT_ARTIFACT,
                    path: targetDir,
                },
            }];
    }
    stepsToCheckout() {
        return [
            {
                name: 'Checkout',
                uses: 'actions/checkout@v3',
            },
        ];
    }
    stepsToUploadAssembly(dir) {
        if (this.preSynthed) {
            return [];
        }
        return [{
                name: `Upload ${CDKOUT_ARTIFACT}`,
                uses: 'actions/upload-artifact@v3',
                with: {
                    name: CDKOUT_ARTIFACT,
                    path: dir,
                },
            }];
    }
    renderDependencies(node) {
        const deps = new Array();
        for (const d of node.allDeps) {
            if (d instanceof helpers_internal_1.Graph) {
                deps.push(...d.allLeaves().nodes);
            }
            else {
                deps.push(d);
            }
        }
        return deps.map(x => x.uniqueId);
    }
    renderJobSettingParameters() {
        return this.jobSettings;
    }
    renderGitHubEnvironment(environment) {
        if (!environment) {
            return {};
        }
        if (environment.url === undefined) {
            return { environment: environment.name };
        }
        return { environment };
    }
}
exports.GitHubWorkflow = GitHubWorkflow;
_a = JSII_RTTI_SYMBOL_1;
GitHubWorkflow[_a] = { fqn: "cdk-pipelines-github.GitHubWorkflow", version: "0.0.0" };
function snakeCaseKeys(obj, sep = '-') {
    if (typeof obj !== 'object' || obj == null) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(o => snakeCaseKeys(o, sep));
    }
    const result = {};
    for (let [k, v] of Object.entries(obj)) {
        // we don't want to snake case environment variables
        if (k !== 'env' && typeof v === 'object' && v != null) {
            v = snakeCaseKeys(v);
        }
        result[decamelize(k, { separator: sep })] = v;
    }
    return result;
}
function* flatten(xs) {
    for (const x of xs) {
        for (const y of x) {
            yield y;
        }
    }
}
exports.flatten = flatten;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcGlwZWxpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwyQkFBd0U7QUFDeEUsNkJBQTZCO0FBQzdCLDZDQUEyQztBQUMzQywrQ0FBNkQ7QUFDN0QscURBQWdMO0FBQ2hMLGlGQUF1RztBQUV2Ryx5Q0FBeUM7QUFDekMsdURBQTJFO0FBRzNFLG1DQUFzQztBQUN0QyxtRUFBOEQ7QUFDOUQsaUNBQW9DO0FBQ3BDLDRDQUE0QztBQUM1QywyQ0FBdUM7QUFFdkMsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDO0FBQ2xDLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQztBQTZJckM7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSx3QkFBWTtJQThCOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQWxCVCxlQUFVLEdBQTJDLEVBQUUsQ0FBQztRQUN4RCxpQkFBWSxHQUEyQixFQUFFLENBQUM7UUFHMUMsb0JBQWUsR0FPNUIsRUFBRSxDQUFDO1FBRVAsc0VBQXNFO1FBQ3RFLCtDQUErQztRQUN2QyxZQUFPLEdBQUcsS0FBSyxDQUFDO1FBS3RCLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztRQUN6QyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLElBQUksS0FBSyxDQUFDO1FBQzVDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQztRQUMzQyxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDO1FBQy9DLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDakQsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMs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QU0sRUFBRSxHQUFHLEdBQUcsR0FBRztJQUNuRCxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFO1FBQzFDLE9BQU8sR0FBRyxDQUFDO0tBQ1o7SUFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDdEIsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBUSxDQUFDO0tBQ25EO0lBRUQsTUFBTSxNQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUMzQyxLQUFLLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUN0QyxvREFBb0Q7UUFDcEQsSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFO1lBQ3JELENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdEI7UUFDRCxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0tBQy9DO0lBQ0QsT0FBTyxNQUFhLENBQUM7QUFDdkIsQ0FBQztBQXNCRCxRQUFlLENBQUMsQ0FBQyxPQUFPLENBQUksRUFBaUI7SUFDM0MsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbEIsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDakIsTUFBTSxDQUFDLENBQUM7U0FDVDtLQUNGO0FBQ0gsQ0FBQztBQU5ELDBCQU1DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgbWtkaXJTeW5jLCB3cml0ZUZpbGVTeW5jLCByZWFkRmlsZVN5bmMsIGV4aXN0c1N5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgTmFtZXMsIFN0YWdlIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRQbGFjZWhvbGRlcnMgfSBmcm9tICdhd3MtY2RrLWxpYi9jeC1hcGknO1xuaW1wb3J0IHsgUGlwZWxpbmVCYXNlLCBQaXBlbGluZUJhc2VQcm9wcywgU2hlbGxTdGVwLCBTdGFja0Fzc2V0LCBTdGFja0RlcGxveW1lbnQsIFN0YWNrT3V0cHV0UmVmZXJlbmNlLCBTdGFnZURlcGxveW1lbnQsIFN0ZXAsIFdhdmUsIFdhdmVPcHRpb25zIH0gZnJvbSAnYXdzLWNkay1saWIvcGlwZWxpbmVzJztcbmltcG9ydCB7IEFHcmFwaE5vZGUsIFBpcGVsaW5lR3JhcGgsIEdyYXBoLCBpc0dyYXBoIH0gZnJvbSAnYXdzLWNkay1saWIvcGlwZWxpbmVzL2xpYi9oZWxwZXJzLWludGVybmFsJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZGVjYW1lbGl6ZSBmcm9tICdkZWNhbWVsaXplJztcbmltcG9ydCB7IEF3c0NyZWRlbnRpYWxzLCBBd3NDcmVkZW50aWFsc1Byb3ZpZGVyIH0gZnJvbSAnLi9hd3MtY3JlZGVudGlhbHMnO1xuaW1wb3J0IHsgRG9ja2VyQ3JlZGVudGlhbCB9IGZyb20gJy4vZG9ja2VyLWNyZWRlbnRpYWxzJztcbmltcG9ydCB7IEFkZEdpdEh1YlN0YWdlT3B0aW9ucywgR2l0SHViRW52aXJvbm1lbnQgfSBmcm9tICcuL2dpdGh1Yi1jb21tb24nO1xuaW1wb3J0IHsgR2l0SHViU3RhZ2UgfSBmcm9tICcuL3N0YWdlJztcbmltcG9ydCB7IEdpdEh1YkFjdGlvblN0ZXAgfSBmcm9tICcuL3N0ZXBzL2dpdGh1Yi1hY3Rpb24tc3RlcCc7XG5pbXBvcnQgeyBHaXRIdWJXYXZlIH0gZnJvbSAnLi93YXZlJztcbmltcG9ydCAqIGFzIGdpdGh1YiBmcm9tICcuL3dvcmtmbG93cy1tb2RlbCc7XG5pbXBvcnQgeyBZYW1sRmlsZSB9IGZyb20gJy4veWFtbC1maWxlJztcblxuY29uc3QgQ0RLT1VUX0FSVElGQUNUID0gJ2Nkay5vdXQnO1xuY29uc3QgQVNTRVRfSEFTSF9OQU1FID0gJ2Fzc2V0LWhhc2gnO1xuXG4vKipcbiAqIEpvYiBsZXZlbCBzZXR0aW5ncyBhcHBsaWVkIHRvIGFsbCBqb2JzIGluIHRoZSB3b3JrZmxvdy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBKb2JTZXR0aW5ncyB7XG4gIC8qKlxuICAgKiBqb2JzLjxqb2JfaWQ+LmlmLlxuICAgKlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5naXRodWIuY29tL2VuL2FjdGlvbnMvdXNpbmctd29ya2Zsb3dzL3dvcmtmbG93LXN5bnRheC1mb3ItZ2l0aHViLWFjdGlvbnMjam9ic2pvYl9pZGlmXG4gICAqL1xuICByZWFkb25seSBpZj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBQcm9wcyBmb3IgYEdpdEh1YldvcmtmbG93YC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBHaXRIdWJXb3JrZmxvd1Byb3BzIGV4dGVuZHMgUGlwZWxpbmVCYXNlUHJvcHMge1xuICAvKipcbiAgICogRmlsZSBwYXRoIGZvciB0aGUgR2l0SHViIHdvcmtmbG93LlxuICAgKlxuICAgKiBAZGVmYXVsdCBcIi5naXRodWIvd29ya2Zsb3dzL2RlcGxveS55bWxcIlxuICAgKi9cbiAgcmVhZG9ubHkgd29ya2Zsb3dQYXRoPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSB3b3JrZmxvdy5cbiAgICpcbiAgICogQGRlZmF1bHQgXCJkZXBsb3lcIlxuICAgKi9cbiAgcmVhZG9ubHkgd29ya2Zsb3dOYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBHaXRIdWIgd29ya2Zsb3cgdHJpZ2dlcnMuXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gQnkgZGVmYXVsdCwgd29ya2Zsb3cgaXMgdHJpZ2dlcmVkIG9uIHB1c2ggdG8gdGhlIGBtYWluYCBicmFuY2hcbiAgICogYW5kIGNhbiBhbHNvIGJlIHRyaWdnZXJlZCBtYW51YWxseSAoYHdvcmtmbG93X2Rpc3BhdGNoYCkuXG4gICAqL1xuICByZWFkb25seSB3b3JrZmxvd1RyaWdnZXJzPzogZ2l0aHViLldvcmtmbG93VHJpZ2dlcnM7XG5cbiAgLyoqXG4gICAqIFZlcnNpb24gb2YgdGhlIENESyBDTEkgdG8gdXNlLlxuICAgKiBAZGVmYXVsdCAtIGF1dG9tYXRpY1xuICAgKi9cbiAgcmVhZG9ubHkgY2RrQ2xpVmVyc2lvbj86IHN0cmluZztcblxuICAvKipcbiAgICogSW5kaWNhdGVzIGlmIHRoZSByZXBvc2l0b3J5IGFscmVhZHkgY29udGFpbnMgYSBzeW50aGVzaXplZCBgY2RrLm91dGAgZGlyZWN0b3J5LCBpbiB3aGljaFxuICAgKiBjYXNlIHdlIHdpbGwgc2ltcGx5IGNoZWNrb3V0IHRoZSByZXBvIGluIGpvYnMgdGhhdCByZXF1aXJlIGBjZGsub3V0YC5cbiAgICpcbiAgICogQGRlZmF1bHQgZmFsc2VcbiAgICovXG4gIHJlYWRvbmx5IHByZVN5bnRoZWQ/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBDb25maWd1cmUgcHJvdmlkZXIgZm9yIEFXUyBjcmVkZW50aWFscyB1c2VkIGZvciBkZXBsb3ltZW50LlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEdldCBBV1MgY3JlZGVudGlhbHMgZnJvbSBHaXRIdWIgc2VjcmV0cyBgQVdTX0FDQ0VTU19LRVlfSURgIGFuZCBgQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZYC5cbiAgICovXG4gIHJlYWRvbmx5IGF3c0NyZWRzPzogQXdzQ3JlZGVudGlhbHNQcm92aWRlcjtcblxuICAvKipcbiAgICogTmFtZXMgb2YgR2l0SHViIHJlcG9zaXRvcnkgc2VjcmV0cyB0aGF0IGluY2x1ZGUgQVdTIGNyZWRlbnRpYWxzIGZvclxuICAgKiBkZXBsb3ltZW50LlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIGBBV1NfQUNDRVNTX0tFWV9JRGAgYW5kIGBBV1NfU0VDUkVUX0FDQ0VTU19LRVlgLlxuICAgKlxuICAgKiBAZGVwcmVjYXRlZCBVc2UgYGF3c0NyZWRzLmZyb21HaXRIdWJTZWNyZXRzKClgIGluc3RlYWQuXG4gICAqL1xuICByZWFkb25seSBhd3NDcmVkZW50aWFscz86IEF3c0NyZWRlbnRpYWxzU2VjcmV0cztcblxuICAvKipcbiAgICogQSByb2xlIHRoYXQgdXRpbGl6ZXMgdGhlIEdpdEh1YiBPSURDIElkZW50aXR5IFByb3ZpZGVyIGluIHlvdXIgQVdTIGFjY291bnQuXG4gICAqIElmIHN1cHBsaWVkLCB0aGlzIHdpbGwgYmUgdXNlZCBpbnN0ZWFkIG9mIGBhd3NDcmVkZW50aWFsc2AuXG4gICAqXG4gICAqIFlvdSBjYW4gY3JlYXRlIHlvdXIgb3duIHJvbGUgaW4gdGhlIGNvbnNvbGUgd2l0aCB0aGUgbmVjZXNzYXJ5IHRydXN0IHBvbGljeVxuICAgKiB0byBhbGxvdyBnaXRIdWIgYWN0aW9ucyBmcm9tIHlvdXIgZ2l0SHViIHJlcG9zaXRvcnkgdG8gYXNzdW1lIHRoZSByb2xlLCBvclxuICAgKiB5b3UgY2FuIHV0aWxpemUgdGhlIGBHaXRIdWJBY3Rpb25Sb2xlYCBjb25zdHJ1Y3QgdG8gY3JlYXRlIGEgcm9sZSBmb3IgeW91LlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEdpdEh1YiByZXBvc2l0b3J5IHNlY3JldHMgYXJlIHVzZWQgaW5zdGVhZCBvZiBPcGVuSWQgQ29ubmVjdCByb2xlLlxuICAgKlxuICAgKiBAZGVwcmVjYXRlZCBVc2UgYGF3c0NyZWRzLmZyb21PcGVuSWRDb25uZWN0KClgIGluc3RlYWQuXG4gICAqL1xuICByZWFkb25seSBnaXRIdWJBY3Rpb25Sb2xlQXJuPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBCdWlsZCBjb250YWluZXIgb3B0aW9ucy5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBHaXRIdWIgZGVmYXVsdHNcbiAgICovXG4gIHJlYWRvbmx5IGJ1aWxkQ29udGFpbmVyPzogZ2l0aHViLkNvbnRhaW5lck9wdGlvbnM7XG5cbiAgLyoqXG4gICAqIEdpdEh1YiB3b3JrZmxvdyBzdGVwcyB0byBleGVjdXRlIGJlZm9yZSBidWlsZC5cbiAgICpcbiAgICogQGRlZmF1bHQgW11cbiAgICovXG4gIHJlYWRvbmx5IHByZUJ1aWxkU3RlcHM/OiBnaXRodWIuSm9iU3RlcFtdO1xuXG4gIC8qKlxuICAgKiBHaXRIdWIgd29ya2Zsb3cgc3RlcHMgdG8gZXhlY3V0ZSBhZnRlciBidWlsZC5cbiAgICpcbiAgICogQGRlZmF1bHQgW11cbiAgICovXG4gIHJlYWRvbmx5IHBvc3RCdWlsZFN0ZXBzPzogZ2l0aHViLkpvYlN0ZXBbXTtcblxuICAvKipcbiAgICogVGhlIERvY2tlciBDcmVkZW50aWFscyB0byB1c2UgdG8gbG9naW4uIElmIHlvdSBzZXQgdGhpcyB2YXJpYWJsZSxcbiAgICogeW91IHdpbGwgYmUgbG9nZ2VkIGluIHRvIGRvY2tlciB3aGVuIHlvdSB1cGxvYWQgRG9ja2VyIEFzc2V0cy5cbiAgICovXG4gIHJlYWRvbmx5IGRvY2tlckNyZWRlbnRpYWxzPzogRG9ja2VyQ3JlZGVudGlhbFtdO1xuXG4gIC8qKlxuICAgKiBUaGUgdHlwZSBvZiBydW5uZXIgdG8gcnVuIHRoZSBqb2Igb24uIFRoZSBydW5uZXIgY2FuIGJlIGVpdGhlciBhXG4gICAqIEdpdEh1Yi1ob3N0ZWQgcnVubmVyIG9yIGEgc2VsZi1ob3N0ZWQgcnVubmVyLlxuICAgKlxuICAgKiBAZGVmYXVsdCBSdW5uZXIuVUJVTlRVX0xBVEVTVFxuICAgKi9cbiAgcmVhZG9ubHkgcnVubmVyPzogZ2l0aHViLlJ1bm5lcjtcblxuICAvKipcbiAgICogV2lsbCBhc3N1bWUgdGhlIEdpdEh1YkFjdGlvblJvbGUgaW4gdGhpcyByZWdpb24gd2hlbiBwdWJsaXNoaW5nIGFzc2V0cy5cbiAgICogVGhpcyBpcyBOT1QgdGhlIHJlZ2lvbiBpbiB3aGljaCB0aGUgYXNzZXRzIGFyZSBwdWJsaXNoZWQuXG4gICAqXG4gICAqIEluIG1vc3QgY2FzZXMsIHlvdSBkbyBub3QgaGF2ZSB0byB3b3JyeSBhYm91dCB0aGlzIHByb3BlcnR5LCBhbmQgY2FuIHNhZmVseVxuICAgKiBpZ25vcmUgaXQuXG4gICAqXG4gICAqIEBkZWZhdWx0IFwidXMtd2VzdC0yXCJcbiAgICovXG4gIHJlYWRvbmx5IHB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBKb2IgbGV2ZWwgc2V0dGluZ3MgdGhhdCB3aWxsIGJlIGFwcGxpZWQgdG8gYWxsIGpvYnMgaW4gdGhlIHdvcmtmbG93LFxuICAgKiBpbmNsdWRpbmcgc3ludGggYW5kIGFzc2V0IGRlcGxveSBqb2JzLiBDdXJyZW50bHkgdGhlIG9ubHkgdmFsaWQgc2V0dGluZ1xuICAgKiBpcyAnaWYnLiBZb3UgY2FuIHVzZSB0aGlzIHRvIHJ1biBqb2JzIG9ubHkgaW4gc3BlY2lmaWMgcmVwb3NpdG9yaWVzLlxuICAgKlxuICAgKiBAc2VlIGh0dHBzOi8vZG9jcy5naXRodWIuY29tL2VuL2FjdGlvbnMvdXNpbmctd29ya2Zsb3dzL3dvcmtmbG93LXN5bnRheC1mb3ItZ2l0aHViLWFjdGlvbnMjZXhhbXBsZS1vbmx5LXJ1bi1qb2ItZm9yLXNwZWNpZmljLXJlcG9zaXRvcnlcbiAgICovXG4gIHJlYWRvbmx5IGpvYlNldHRpbmdzPzogSm9iU2V0dGluZ3M7XG59XG5cbi8qKlxuICogQ0RLIFBpcGVsaW5lcyBmb3IgR2l0SHViIHdvcmtmbG93cy5cbiAqL1xuZXhwb3J0IGNsYXNzIEdpdEh1YldvcmtmbG93IGV4dGVuZHMgUGlwZWxpbmVCYXNlIHtcbiAgcHVibGljIHJlYWRvbmx5IHdvcmtmbG93UGF0aDogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgd29ya2Zsb3dOYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyByZWFkb25seSB3b3JrZmxvd0ZpbGU6IFlhbWxGaWxlO1xuXG4gIHByaXZhdGUgcmVhZG9ubHkgd29ya2Zsb3dUcmlnZ2VyczogZ2l0aHViLldvcmtmbG93VHJpZ2dlcnM7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJlU3ludGhlZDogYm9vbGVhbjtcbiAgcHJpdmF0ZSByZWFkb25seSBhd3NDcmVkZW50aWFsczogQXdzQ3JlZGVudGlhbHNQcm92aWRlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBkb2NrZXJDcmVkZW50aWFsczogRG9ja2VyQ3JlZGVudGlhbFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGNka0NsaVZlcnNpb24/OiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgYnVpbGRDb250YWluZXI/OiBnaXRodWIuQ29udGFpbmVyT3B0aW9ucztcbiAgcHJpdmF0ZSByZWFkb25seSBwcmVCdWlsZFN0ZXBzOiBnaXRodWIuSm9iU3RlcFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IHBvc3RCdWlsZFN0ZXBzOiBnaXRodWIuSm9iU3RlcFtdO1xuICBwcml2YXRlIHJlYWRvbmx5IGpvYk91dHB1dHM6IFJlY29yZDxzdHJpbmcsIGdpdGh1Yi5Kb2JTdGVwT3V0cHV0W10+ID0ge307XG4gIHByaXZhdGUgcmVhZG9ubHkgYXNzZXRIYXNoTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIHByaXZhdGUgcmVhZG9ubHkgcnVubmVyOiBnaXRodWIuUnVubmVyO1xuICBwcml2YXRlIHJlYWRvbmx5IHB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RhY2tQcm9wZXJ0aWVzOiBSZWNvcmQ8XG4gIHN0cmluZyxcbiAge1xuICAgIGVudmlyb25tZW50OiBBZGRHaXRIdWJTdGFnZU9wdGlvbnNbJ2dpdEh1YkVudmlyb25tZW50J107XG4gICAgY2FwYWJpbGl0aWVzOiBBZGRHaXRIdWJTdGFnZU9wdGlvbnNbJ3N0YWNrQ2FwYWJpbGl0aWVzJ107XG4gICAgc2V0dGluZ3M6IEFkZEdpdEh1YlN0YWdlT3B0aW9uc1snam9iU2V0dGluZ3MnXTtcbiAgfVxuICA+ID0ge307XG4gIHByaXZhdGUgcmVhZG9ubHkgam9iU2V0dGluZ3M/OiBKb2JTZXR0aW5ncztcbiAgLy8gaW4gb3JkZXIgdG8ga2VlcCB0cmFjayBvZiBpZiB0aGlzIHBpcGVsaW5lIGhhcyBiZWVuIGJ1aWx0IHNvIHdlIGNhblxuICAvLyBjYXRjaCBsYXRlciBjYWxscyB0byBhZGRXYXZlKCkgb3IgYWRkU3RhZ2UoKVxuICBwcml2YXRlIGJ1aWx0R0ggPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogR2l0SHViV29ya2Zsb3dQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgdGhpcy5jZGtDbGlWZXJzaW9uID0gcHJvcHMuY2RrQ2xpVmVyc2lvbjtcbiAgICB0aGlzLnByZVN5bnRoZWQgPSBwcm9wcy5wcmVTeW50aGVkID8/IGZhbHNlO1xuICAgIHRoaXMuYnVpbGRDb250YWluZXIgPSBwcm9wcy5idWlsZENvbnRhaW5lcjtcbiAgICB0aGlzLnByZUJ1aWxkU3RlcHMgPSBwcm9wcy5wcmVCdWlsZFN0ZXBzID8/IFtdO1xuICAgIHRoaXMucG9zdEJ1aWxkU3RlcHMgPSBwcm9wcy5wb3N0QnVpbGRTdGVwcyA/PyBbXTtcbiAgICB0aGlzLmpvYlNldHRpbmdzID0gcHJvcHMuam9iU2V0dGluZ3M7XG5cbiAgICB0aGlzLmF3c0NyZWRlbnRpYWxzID0gdGhpcy5nZXRBd3NDcmVkZW50aWFscyhwcm9wcyk7XG5cbiAgICB0aGlzLmRvY2tlckNyZWRlbnRpYWxzID0gcHJvcHMuZG9ja2VyQ3JlZGVudGlhbHMgPz8gW107XG5cbiAgICB0aGlzLndvcmtmbG93UGF0aCA9IHByb3BzLndvcmtmbG93UGF0aCA/PyAnLmdpdGh1Yi93b3JrZmxvd3MvZGVwbG95LnltbCc7XG4gICAgaWYgKCF0aGlzLndvcmtmbG93UGF0aC5lbmRzV2l0aCgnLnltbCcpICYmIXRoaXMud29ya2Zsb3dQYXRoLmVuZHNXaXRoKCcueWFtbCcpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3dvcmtmbG93IGZpbGUgaXMgZXhwZWN0ZWQgdG8gYmUgYSB5YW1sIGZpbGUnKTtcbiAgICB9XG4gICAgaWYgKCF0aGlzLndvcmtmbG93UGF0aC5pbmNsdWRlcygnLmdpdGh1Yi93b3JrZmxvd3MvJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignd29ya2Zsb3cgZmlsZXMgbXVzdCBiZSBzdG9yZWQgaW4gdGhlIFxcJy5naXRodWIvd29ya2Zsb3dzXFwnIGRpcmVjdG9yeSBvZiB5b3VyIHJlcG9zaXRvcnknKTtcbiAgICB9XG5cbiAgICB0aGlzLndvcmtmbG93RmlsZSA9IG5ldyBZYW1sRmlsZSh0aGlzLndvcmtmbG93UGF0aCk7XG4gICAgdGhpcy53b3JrZmxvd05hbWUgPSBwcm9wcy53b3JrZmxvd05hbWUgPz8gJ2RlcGxveSc7XG4gICAgdGhpcy53b3JrZmxvd1RyaWdnZXJzID0gcHJvcHMud29ya2Zsb3dUcmlnZ2VycyA/PyB7XG4gICAgICBwdXNoOiB7IGJyYW5jaGVzOiBbJ21haW4nXSB9LFxuICAgICAgd29ya2Zsb3dEaXNwYXRjaDoge30sXG4gICAgfTtcblxuICAgIHRoaXMucnVubmVyID0gcHJvcHMucnVubmVyID8/IGdpdGh1Yi5SdW5uZXIuVUJVTlRVX0xBVEVTVDtcbiAgICB0aGlzLnB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uID0gcHJvcHMucHVibGlzaEFzc2V0c0F1dGhSZWdpb24gPz8gJ3VzLXdlc3QtMic7XG4gIH1cblxuICAvKipcbiAgICogUGFyc2UgQVdTIGNyZWRlbnRpYWwgY29uZmlndXJhdGlvbiBmcm9tIGRlcHJlY2F0ZWQgcHJvcGVydGllcyBGb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gICAqL1xuICBwcml2YXRlIGdldEF3c0NyZWRlbnRpYWxzKHByb3BzOiBHaXRIdWJXb3JrZmxvd1Byb3BzKSB7XG4gICAgaWYgKHByb3BzLmdpdEh1YkFjdGlvblJvbGVBcm4pIHtcbiAgICAgIGlmIChwcm9wcy5hd3NDcmVkcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSBwcm92aWRlIG9ubHkgb25lIG1ldGhvZCBvZiBhdXRoZW50aWNhdGlvbiAocmVtb3ZlIGdpdGh1YkFjdGlvblJvbGVBcm4pJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQXdzQ3JlZGVudGlhbHMuZnJvbU9wZW5JZENvbm5lY3Qoe1xuICAgICAgICBnaXRIdWJBY3Rpb25Sb2xlQXJuOiBwcm9wcy5naXRIdWJBY3Rpb25Sb2xlQXJuLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHByb3BzLmF3c0NyZWRlbnRpYWxzKSB7XG4gICAgICBpZiAocHJvcHMuYXdzQ3JlZHMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQbGVhc2UgcHJvdmlkZSBvbmx5IG9uZSBtZXRob2Qgb2YgYXV0aGVudGljYXRpb24gKHJlbW92ZSBhd3NDcmVkZW50aWFscyknKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBBd3NDcmVkZW50aWFscy5mcm9tR2l0SHViU2VjcmV0cyh7XG4gICAgICAgIGFjY2Vzc0tleUlkOiAnQVdTX0FDQ0VTU19LRVlfSUQnLFxuICAgICAgICBzZWNyZXRBY2Nlc3NLZXk6ICdBV1NfU0VDUkVUX0FDQ0VTU19LRVknLFxuICAgICAgICAuLi5wcm9wcy5hd3NDcmVkZW50aWFscyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9wcy5hd3NDcmVkcyA/PyBBd3NDcmVkZW50aWFscy5mcm9tR2l0SHViU2VjcmV0cygpO1xuICB9XG5cbiAgLyoqXG4gICAqIERlcGxveSBhIHNpbmdsZSBTdGFnZSBieSBpdHNlbGYgd2l0aCBvcHRpb25zIGZvciBmdXJ0aGVyIEdpdEh1YiBjb25maWd1cmF0aW9uLlxuICAgKlxuICAgKiBBZGQgYSBTdGFnZSB0byB0aGUgcGlwZWxpbmUsIHRvIGJlIGRlcGxveWVkIGluIHNlcXVlbmNlIHdpdGggb3RoZXIgU3RhZ2VzIGFkZGVkIHRvIHRoZSBwaXBlbGluZS5cbiAgICogQWxsIFN0YWNrcyBpbiB0aGUgc3RhZ2Ugd2lsbCBiZSBkZXBsb3llZCBpbiBhbiBvcmRlciBhdXRvbWF0aWNhbGx5IGRldGVybWluZWQgYnkgdGhlaXIgcmVsYXRpdmUgZGVwZW5kZW5jaWVzLlxuICAgKi9cbiAgcHVibGljIGFkZFN0YWdlV2l0aEdpdEh1Yk9wdGlvbnMoc3RhZ2U6IFN0YWdlLCBvcHRpb25zPzogQWRkR2l0SHViU3RhZ2VPcHRpb25zKTogU3RhZ2VEZXBsb3ltZW50IHtcbiAgICBjb25zdCBzdGFnZURlcGxveW1lbnQgPSB0aGlzLmFkZFN0YWdlKHN0YWdlLCBvcHRpb25zKTtcblxuICAgIC8vIGtlZXAgdHJhY2sgb2YgR2l0SHViIHNwZWNpZmljIG9wdGlvbnNcbiAgICBjb25zdCBzdGFja3MgPSBzdGFnZURlcGxveW1lbnQuc3RhY2tzO1xuICAgIHRoaXMuYWRkU3RhY2tQcm9wcyhzdGFja3MsICdlbnZpcm9ubWVudCcsIG9wdGlvbnM/LmdpdEh1YkVudmlyb25tZW50KTtcbiAgICB0aGlzLmFkZFN0YWNrUHJvcHMoc3RhY2tzLCAnY2FwYWJpbGl0aWVzJywgb3B0aW9ucz8uc3RhY2tDYXBhYmlsaXRpZXMpO1xuICAgIHRoaXMuYWRkU3RhY2tQcm9wcyhzdGFja3MsICdzZXR0aW5ncycsIG9wdGlvbnM/LmpvYlNldHRpbmdzKTtcblxuICAgIHJldHVybiBzdGFnZURlcGxveW1lbnQ7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgV2F2ZSB0byB0aGUgcGlwZWxpbmUsIGZvciBkZXBsb3lpbmcgbXVsdGlwbGUgU3RhZ2VzIGluIHBhcmFsbGVsXG4gICAqXG4gICAqIFVzZSB0aGUgcmV0dXJuIG9iamVjdCBvZiB0aGlzIG1ldGhvZCB0byBkZXBsb3kgbXVsdGlwbGUgc3RhZ2VzIGluIHBhcmFsbGVsLlxuICAgKlxuICAgKiBFeGFtcGxlOlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBkZWNsYXJlIGNvbnN0IHBpcGVsaW5lOiBHaXRIdWJXb3JrZmxvdzsgLy8gYXNzaWduIHBpcGVsaW5lIGEgdmFsdWVcbiAgICpcbiAgICogY29uc3Qgd2F2ZSA9IHBpcGVsaW5lLmFkZFdhdmUoJ015V2F2ZScpO1xuICAgKiB3YXZlLmFkZFN0YWdlKG5ldyBNeVN0YWdlKHRoaXMsICdTdGFnZTEnKSk7XG4gICAqIHdhdmUuYWRkU3RhZ2UobmV3IE15U3RhZ2UodGhpcywgJ1N0YWdlMicpKTtcbiAgICogYGBgXG4gICAqL1xuICBwdWJsaWMgYWRkV2F2ZShpZDogc3RyaW5nLCBvcHRpb25zPzogV2F2ZU9wdGlvbnMpOiBXYXZlIHtcbiAgICByZXR1cm4gdGhpcy5hZGRHaXRIdWJXYXZlKGlkLCBvcHRpb25zKTtcbiAgfVxuXG4gIHB1YmxpYyBhZGRHaXRIdWJXYXZlKGlkOiBzdHJpbmcsIG9wdGlvbnM/OiBXYXZlT3B0aW9ucyk6IEdpdEh1YldhdmUge1xuICAgIGlmICh0aGlzLmJ1aWx0R0gpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgXCJhZGRXYXZlOiBjYW4ndCBhZGQgV2F2ZXMgYW55bW9yZSBhZnRlciBidWlsZFBpcGVsaW5lKCkgaGFzIGJlZW4gY2FsbGVkXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHdhdmUgPSBuZXcgR2l0SHViV2F2ZShpZCwgdGhpcywgb3B0aW9ucyk7XG4gICAgdGhpcy53YXZlcy5wdXNoKHdhdmUpO1xuICAgIHJldHVybiB3YXZlO1xuICB9XG5cbiAgLyoqXG4gICAqIFN1cHBvcnQgYWRkaW5nIHN0YWdlcyB3aXRoIEdpdEh1YiBvcHRpb25zIHRvIHdhdmVzIC0gc2hvdWxkIE9OTFkgYmUgY2FsbGVkIGludGVybmFsbHkuXG4gICAqXG4gICAqIFVzZSBgcGlwZWxpbmUuYWRkV2F2ZSgpYCBhbmQgaXQnbGwgY2FsbCB0aGlzIHdoZW4gYHdhdmUuYWRkU3RhZ2UoKWAgaXMgY2FsbGVkLlxuICAgKlxuICAgKiBgcGlwZWxpbmUuYWRkU3RhZ2UoKWAgd2lsbCBhbHNvIGNhbGwgdGhpcywgc2luY2UgaXQgY2FsbHMgYHBpcGVsaW5lLmFkZFdhdmUoKS5hZGRTdGFnZSgpYC5cbiAgICpcbiAgICogIEBpbnRlcm5hbFxuICAgKi9cbiAgcHVibGljIF9hZGRTdGFnZUZyb21XYXZlKFxuICAgIHN0YWdlOiBTdGFnZSxcbiAgICBzdGFnZURlcGxveW1lbnQ6IFN0YWdlRGVwbG95bWVudCxcbiAgICBvcHRpb25zPzogQWRkR2l0SHViU3RhZ2VPcHRpb25zLFxuICApIHtcbiAgICBpZiAoIShzdGFnZSBpbnN0YW5jZW9mIEdpdEh1YlN0YWdlKSAmJiBvcHRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBnaFN0YWdlID0gc3RhZ2UgaW5zdGFuY2VvZiBHaXRIdWJTdGFnZSA/IHN0YWdlIDogdW5kZWZpbmVkO1xuXG4gICAgLy8ga2VlcCB0cmFjayBvZiBHaXRIdWIgc3BlY2lmaWMgb3B0aW9uc1xuICAgIGNvbnN0IHN0YWNrcyA9IHN0YWdlRGVwbG95bWVudC5zdGFja3M7XG4gICAgdGhpcy5hZGRTdGFja1Byb3BzKFxuICAgICAgc3RhY2tzLFxuICAgICAgJ2Vudmlyb25tZW50JyxcbiAgICAgIGdoU3RhZ2U/LnByb3BzPy5naXRIdWJFbnZpcm9ubWVudCA/PyBvcHRpb25zPy5naXRIdWJFbnZpcm9ubWVudCxcbiAgICApO1xuICAgIHRoaXMuYWRkU3RhY2tQcm9wcyhcbiAgICAgIHN0YWNrcyxcbiAgICAgICdjYXBhYmlsaXRpZXMnLFxuICAgICAgZ2hTdGFnZT8ucHJvcHM/LnN0YWNrQ2FwYWJpbGl0aWVzID8/IG9wdGlvbnM/LnN0YWNrQ2FwYWJpbGl0aWVzLFxuICAgICk7XG4gICAgdGhpcy5hZGRTdGFja1Byb3BzKFxuICAgICAgc3RhY2tzLFxuICAgICAgJ3NldHRpbmdzJyxcbiAgICAgIGdoU3RhZ2U/LnByb3BzPy5qb2JTZXR0aW5ncyA/PyBvcHRpb25zPy5qb2JTZXR0aW5ncyxcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBhZGRTdGFja1Byb3BzKHN0YWNrczogU3RhY2tEZXBsb3ltZW50W10sIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSB7XG4gICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHsgcmV0dXJuOyB9XG4gICAgZm9yIChjb25zdCBzdGFjayBvZiBzdGFja3MpIHtcbiAgICAgIHRoaXMuc3RhY2tQcm9wZXJ0aWVzW3N0YWNrLnN0YWNrQXJ0aWZhY3RJZF0gPSB7XG4gICAgICAgIC4uLnRoaXMuc3RhY2tQcm9wZXJ0aWVzW3N0YWNrLnN0YWNrQXJ0aWZhY3RJZF0sXG4gICAgICAgIFtrZXldOiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcHJvdGVjdGVkIGRvQnVpbGRQaXBlbGluZSgpIHtcbiAgICB0aGlzLmJ1aWx0R0ggPSB0cnVlO1xuICAgIGNvbnN0IGFwcCA9IFN0YWdlLm9mKHRoaXMpO1xuICAgIGlmICghYXBwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBHaXRIdWIgV29ya2Zsb3cgbXVzdCBiZSBkZWZpbmVkIGluIHRoZSBzY29wZSBvZiBhbiBBcHAnKTtcbiAgICB9XG4gICAgY29uc3QgY2Rrb3V0RGlyID0gYXBwLm91dGRpcjtcblxuICAgIGNvbnN0IGpvYnMgPSBuZXcgQXJyYXk8Sm9iPigpO1xuXG4gICAgY29uc3Qgc3RydWN0dXJlID0gbmV3IFBpcGVsaW5lR3JhcGgodGhpcywge1xuICAgICAgc2VsZk11dGF0aW9uOiBmYWxzZSxcbiAgICAgIHB1Ymxpc2hUZW1wbGF0ZTogdHJ1ZSxcbiAgICAgIHByZXBhcmVTdGVwOiBmYWxzZSwgLy8gd2UgY3JlYXRlIGFuZCBleGVjdXRlIHRoZSBjaGFuZ2VzZXQgaW4gYSBzaW5nbGUgam9iXG4gICAgfSk7XG5cbiAgICBmb3IgKGNvbnN0IHN0YWdlTm9kZSBvZiBmbGF0dGVuKHN0cnVjdHVyZS5ncmFwaC5zb3J0ZWRDaGlsZHJlbigpKSkge1xuICAgICAgaWYgKCFpc0dyYXBoKHN0YWdlTm9kZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb3AtbGV2ZWwgY2hpbGRyZW4gbXVzdCBiZSBncmFwaHMsIGdvdCAnJHtzdGFnZU5vZGV9J2ApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0cmFuY2hlcyA9IHN0YWdlTm9kZS5zb3J0ZWRMZWF2ZXMoKTtcblxuICAgICAgZm9yIChjb25zdCB0cmFuY2hlIG9mIHRyYW5jaGVzKSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiB0cmFuY2hlKSB7XG4gICAgICAgICAgY29uc3Qgam9iID0gdGhpcy5qb2JGb3JOb2RlKG5vZGUsIHtcbiAgICAgICAgICAgIGFzc2VtYmx5RGlyOiBjZGtvdXREaXIsXG4gICAgICAgICAgICBzdHJ1Y3R1cmUsXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAoam9iKSB7XG4gICAgICAgICAgICBqb2JzLnB1c2goam9iKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjb252ZXJ0IGpvYnMgdG8gYSBtYXAgYW5kIG1ha2Ugc3VyZSB0aGVyZSBhcmUgbm8gZHVwbGljYXRlc1xuICAgIGNvbnN0IGpvYm1hcDogUmVjb3JkPHN0cmluZywgZ2l0aHViLkpvYj4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGpvYiBvZiBqb2JzKSB7XG4gICAgICBpZiAoam9iLmlkIGluIGpvYm1hcCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBqb2IgaWQgJHtqb2IuaWR9YCk7XG4gICAgICB9XG4gICAgICBqb2JtYXBbam9iLmlkXSA9IHNuYWtlQ2FzZUtleXMoam9iLmRlZmluaXRpb24pO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBqb2JzIHdpdGggbGF0ZS1ib3VuZCBvdXRwdXQgcmVxdWVzdHNcbiAgICB0aGlzLmluc2VydEpvYk91dHB1dHMoam9ibWFwKTtcblxuICAgIGNvbnN0IHdvcmtmbG93ID0ge1xuICAgICAgbmFtZTogdGhpcy53b3JrZmxvd05hbWUsXG4gICAgICBvbjogc25ha2VDYXNlS2V5cyh0aGlzLndvcmtmbG93VHJpZ2dlcnMsICdfJyksXG4gICAgICBqb2JzOiBqb2JtYXAsXG4gICAgfTtcblxuICAgIC8vIHdyaXRlIGFzIGEgeWFtbCBmaWxlXG4gICAgdGhpcy53b3JrZmxvd0ZpbGUudXBkYXRlKHdvcmtmbG93KTtcblxuICAgIC8vIGNyZWF0ZSBkaXJlY3RvcnkgaWYgaXQgZG9lcyBub3QgZXhpc3RcbiAgICBta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMud29ya2Zsb3dQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cbiAgICAvLyBHSVRIVUJfV09SS0ZMT1cgaXMgc2V0IHdoZW4gR2l0SHViIEFjdGlvbnMgaXMgcnVubmluZyB0aGUgd29ya2Zsb3cuXG4gICAgLy8gc2VlOiBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9hY3Rpb25zL2xlYXJuLWdpdGh1Yi1hY3Rpb25zL2Vudmlyb25tZW50LXZhcmlhYmxlcyNkZWZhdWx0LWVudmlyb25tZW50LXZhcmlhYmxlc1xuICAgIGNvbnN0IGNvbnRleHRWYWx1ZSA9IHRoaXMubm9kZS50cnlHZXRDb250ZXh0KCdjZGstcGlwZWxpbmVzLWdpdGh1YjpkaWZmUHJvdGVjdGlvbicpO1xuICAgIGNvbnN0IGRpZmZQcm90ZWN0aW9uID0gY29udGV4dFZhbHVlID09PSAnZmFsc2UnID8gZmFsc2UgOiBjb250ZXh0VmFsdWUgPz8gdHJ1ZTtcbiAgICBpZiAoZGlmZlByb3RlY3Rpb24gJiYgcHJvY2Vzcy5lbnYuR0lUSFVCX1dPUktGTE9XID09PSB0aGlzLndvcmtmbG93TmFtZSkge1xuICAgICAgLy8gY2hlY2sgaWYgd29ya2Zsb3cgZmlsZSBoYXMgY2hhbmdlZFxuICAgICAgaWYgKCFleGlzdHNTeW5jKHRoaXMud29ya2Zsb3dQYXRoKSB8fCB0aGlzLndvcmtmbG93RmlsZS50b1lhbWwoKSAhPT0gcmVhZEZpbGVTeW5jKHRoaXMud29ya2Zsb3dQYXRoLCAndXRmOCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUGxlYXNlIGNvbW1pdCB0aGUgdXBkYXRlZCB3b3JrZmxvdyBmaWxlICR7cGF0aC5yZWxhdGl2ZShfX2Rpcm5hbWUsIHRoaXMud29ya2Zsb3dQYXRoKX0gd2hlbiB5b3UgY2hhbmdlIHlvdXIgcGlwZWxpbmUgZGVmaW5pdGlvbi5gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLndvcmtmbG93RmlsZS53cml0ZUZpbGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5zZXJ0Sm9iT3V0cHV0cyhqb2JtYXA6IFJlY29yZDxzdHJpbmcsIGdpdGh1Yi5Kb2I+KSB7XG4gICAgZm9yIChjb25zdCBbam9iSWQsIGpvYk91dHB1dHNdIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuam9iT3V0cHV0cykpIHtcbiAgICAgIGpvYm1hcFtqb2JJZF0gPSB7XG4gICAgICAgIC4uLmpvYm1hcFtqb2JJZF0sXG4gICAgICAgIG91dHB1dHM6IHtcbiAgICAgICAgICAuLi5qb2JtYXBbam9iSWRdLm91dHB1dHMsXG4gICAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JPdXRwdXRzKGpvYk91dHB1dHMpLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckpvYk91dHB1dHMob3V0cHV0czogZ2l0aHViLkpvYlN0ZXBPdXRwdXRbXSkge1xuICAgIGNvbnN0IHJlbmRlcmVkT3V0cHV0czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgIGZvciAoY29uc3Qgb3V0cHV0IG9mIG91dHB1dHMpIHtcbiAgICAgIHJlbmRlcmVkT3V0cHV0c1tvdXRwdXQub3V0cHV0TmFtZV0gPSBgXFwke3sgc3RlcHMuJHtvdXRwdXQuc3RlcElkfS5vdXRwdXRzLiR7b3V0cHV0Lm91dHB1dE5hbWV9IH19YDtcbiAgICB9XG4gICAgcmV0dXJuIHJlbmRlcmVkT3V0cHV0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBNYWtlIGFuIGFjdGlvbiBmcm9tIHRoZSBnaXZlbiBub2RlIGFuZC9vciBzdGVwXG4gICAqL1xuICBwcml2YXRlIGpvYkZvck5vZGUobm9kZTogQUdyYXBoTm9kZSwgb3B0aW9uczogQ29udGV4dCk6IEpvYiB8IHVuZGVmaW5lZCB7XG4gICAgc3dpdGNoIChub2RlLmRhdGE/LnR5cGUpIHtcbiAgICAgIC8vIE5vdGhpbmcgZm9yIHRoZXNlLCB0aGV5IGFyZSBncm91cGluZ3MgKHNob3VsZG4ndCBldmVuIGhhdmUgcG9wcGVkIHVwIGhlcmUpXG4gICAgICBjYXNlICdncm91cCc6XG4gICAgICBjYXNlICdzdGFjay1ncm91cCc6XG4gICAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBqb2JGb3JOb2RlOiBkaWQgbm90IGV4cGVjdCB0byBnZXQgZ3JvdXAgbm9kZXM6ICR7bm9kZS5kYXRhPy50eXBlfWApO1xuXG4gICAgICBjYXNlICdzZWxmLXVwZGF0ZSc6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignR2l0SHViIFdvcmtmbG93cyBkb2VzIG5vdCBzdXBwb3J0IHNlbGYgbXV0YXRpb24nKTtcblxuICAgICAgY2FzZSAncHVibGlzaC1hc3NldHMnOlxuICAgICAgICByZXR1cm4gdGhpcy5qb2JGb3JBc3NldFB1Ymxpc2gobm9kZSwgbm9kZS5kYXRhLmFzc2V0cywgb3B0aW9ucyk7XG5cbiAgICAgIGNhc2UgJ3ByZXBhcmUnOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1wicHJlcGFyZVwiIGlzIG5vdCBzdXBwb3J0ZWQgYnkgR2l0SHViIFdvcmtmbG93cycpO1xuXG4gICAgICBjYXNlICdleGVjdXRlJzpcbiAgICAgICAgcmV0dXJuIHRoaXMuam9iRm9yRGVwbG95KG5vZGUsIG5vZGUuZGF0YS5zdGFjaywgbm9kZS5kYXRhLmNhcHR1cmVPdXRwdXRzKTtcblxuICAgICAgY2FzZSAnc3RlcCc6XG4gICAgICAgIGlmIChub2RlLmRhdGEuaXNCdWlsZFN0ZXApIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5qb2JGb3JCdWlsZFN0ZXAobm9kZSwgbm9kZS5kYXRhLnN0ZXApO1xuICAgICAgICB9IGVsc2UgaWYgKG5vZGUuZGF0YS5zdGVwIGluc3RhbmNlb2YgU2hlbGxTdGVwKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuam9iRm9yU2NyaXB0U3RlcChub2RlLCBub2RlLmRhdGEuc3RlcCk7XG4gICAgICAgIH0gZWxzZSBpZiAobm9kZS5kYXRhLnN0ZXAgaW5zdGFuY2VvZiBHaXRIdWJBY3Rpb25TdGVwKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuam9iRm9yR2l0SHViQWN0aW9uU3RlcChub2RlLCBub2RlLmRhdGEuc3RlcCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGB1bnN1cHBvcnRlZCBzdGVwIHR5cGU6ICR7bm9kZS5kYXRhLnN0ZXAuY29uc3RydWN0b3IubmFtZX1gKTtcbiAgICAgICAgfVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICAvLyBUaGUgJ2FzIGFueScgaXMgdGVtcG9yYXJ5LCB1bnRpbCB0aGUgY2hhbmdlIHVwc3RyZWFtIHJvbGxzIG91dFxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEdpdEh1YldvcmZrbG93IGRvZXMgbm90IHN1cHBvcnQgZ3JhcGggbm9kZXMgb2YgdHlwZSAnJHsobm9kZS5kYXRhIGFzIGFueSk/LnR5cGV9Jy4gWW91IGFyZSBwcm9iYWJseSB1c2luZyBhIGZlYXR1cmUgdGhpcyBDREsgUGlwZWxpbmVzIGltcGxlbWVudGF0aW9uIGRvZXMgbm90IHN1cHBvcnQuYCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBqb2JGb3JBc3NldFB1Ymxpc2gobm9kZTogQUdyYXBoTm9kZSwgYXNzZXRzOiBTdGFja0Fzc2V0W10sIG9wdGlvbnM6IENvbnRleHQpOiBKb2Ige1xuICAgIGlmIChhc3NldHMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Fzc2V0IFB1Ymxpc2ggc3RlcCBtdXN0IGhhdmUgYXQgbGVhc3QgMSBhc3NldCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGluc3RhbGxTdWZmaXggPSB0aGlzLmNka0NsaVZlcnNpb24gPyBgQCR7dGhpcy5jZGtDbGlWZXJzaW9ufWAgOiAnJztcbiAgICBjb25zdCBjZGtvdXREaXIgPSBvcHRpb25zLmFzc2VtYmx5RGlyO1xuICAgIGNvbnN0IGpvYklkID0gbm9kZS51bmlxdWVJZDtcbiAgICBjb25zdCBhc3NldElkID0gYXNzZXRzWzBdLmFzc2V0SWQ7XG5cbiAgICAvLyBjaGVjayBpZiBhc3NldCBpcyBkb2NrZXIgYXNzZXQgYW5kIGlmIHdlIGhhdmUgZG9ja2VyIGNyZWRlbnRpYWxzXG4gICAgY29uc3QgZG9ja2VyTG9naW5TdGVwczogZ2l0aHViLkpvYlN0ZXBbXSA9IFtdO1xuICAgIGlmIChub2RlLnVuaXF1ZUlkLmluY2x1ZGVzKCdEb2NrZXJBc3NldCcpICYmIHRoaXMuZG9ja2VyQ3JlZGVudGlhbHMubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCBjcmVkcyBvZiB0aGlzLmRvY2tlckNyZWRlbnRpYWxzKSB7XG4gICAgICAgIGRvY2tlckxvZ2luU3RlcHMucHVzaCguLi50aGlzLnN0ZXBzVG9Db25maWd1cmVEb2NrZXIoY3JlZHMpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgb25lIGZpbGUgYW5kIG1ha2Ugb25lIHN0ZXBcbiAgICBjb25zdCByZWxhdGl2ZVRvQXNzZW1ibHkgPSAocDogc3RyaW5nKSA9PiBwYXRoLnBvc2l4LmpvaW4oY2Rrb3V0RGlyLCBwYXRoLnJlbGF0aXZlKHBhdGgucmVzb2x2ZShjZGtvdXREaXIpLCBwKSk7XG4gICAgY29uc3QgZmlsZUNvbnRlbnRzOiBzdHJpbmdbXSA9IFsnc2V0IC1leCddLmNvbmNhdChhc3NldHMubWFwKChhc3NldCkgPT4ge1xuICAgICAgcmV0dXJuIGBucHggY2RrLWFzc2V0cyAtLXBhdGggXCIke3JlbGF0aXZlVG9Bc3NlbWJseShhc3NldC5hc3NldE1hbmlmZXN0UGF0aCl9XCIgLS12ZXJib3NlIHB1Ymxpc2ggXCIke2Fzc2V0LmFzc2V0U2VsZWN0b3J9XCJgO1xuICAgIH0pKTtcblxuICAgIC8vIHdlIG5lZWQgdGhlIGpvYklkIHRvIHJlZmVyZW5jZSB0aGUgb3V0cHV0cyBsYXRlclxuICAgIHRoaXMuYXNzZXRIYXNoTWFwW2Fzc2V0SWRdID0gam9iSWQ7XG4gICAgZmlsZUNvbnRlbnRzLnB1c2goYGVjaG8gJyR7QVNTRVRfSEFTSF9OQU1FfT0ke2Fzc2V0SWR9JyA+PiAkR0lUSFVCX09VVFBVVGApO1xuXG4gICAgY29uc3QgcHVibGlzaFN0ZXBGaWxlID0gcGF0aC5qb2luKGNka291dERpciwgYHB1Ymxpc2gtJHtOYW1lcy51bmlxdWVJZCh0aGlzKX0tJHtqb2JJZH0tc3RlcC5zaGApO1xuICAgIG1rZGlyU3luYyhwYXRoLmRpcm5hbWUocHVibGlzaFN0ZXBGaWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgd3JpdGVGaWxlU3luYyhwdWJsaXNoU3RlcEZpbGUsIGZpbGVDb250ZW50cy5qb2luKCdcXG4nKSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9KTtcblxuICAgIGNvbnN0IHB1Ymxpc2hTdGVwOiBnaXRodWIuSm9iU3RlcCA9IHtcbiAgICAgIGlkOiAnUHVibGlzaCcsXG4gICAgICBuYW1lOiBgUHVibGlzaCAke2pvYklkfWAsXG4gICAgICBydW46IGAvYmluL2Jhc2ggLi9jZGsub3V0LyR7cGF0aC5yZWxhdGl2ZShjZGtvdXREaXIsIHB1Ymxpc2hTdGVwRmlsZSl9YCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBqb2JJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogYFB1Ymxpc2ggQXNzZXRzICR7am9iSWR9YCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICBuZWVkczogdGhpcy5yZW5kZXJEZXBlbmRlbmNpZXMobm9kZSksXG4gICAgICAgIHBlcm1pc3Npb25zOiB7XG4gICAgICAgICAgY29udGVudHM6IGdpdGh1Yi5Kb2JQZXJtaXNzaW9uLlJFQUQsXG4gICAgICAgICAgaWRUb2tlbjogdGhpcy5hd3NDcmVkZW50aWFscy5qb2JQZXJtaXNzaW9uKCksXG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnNPbjogdGhpcy5ydW5uZXIucnVuc09uLFxuICAgICAgICBvdXRwdXRzOiB7XG4gICAgICAgICAgW0FTU0VUX0hBU0hfTkFNRV06IGBcXCR7eyBzdGVwcy5QdWJsaXNoLm91dHB1dHMuJHtBU1NFVF9IQVNIX05BTUV9IH19YCxcbiAgICAgICAgfSxcbiAgICAgICAgc3RlcHM6IFtcbiAgICAgICAgICAuLi50aGlzLnN0ZXBzVG9Eb3dubG9hZEFzc2VtYmx5KGNka291dERpciksXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0luc3RhbGwnLFxuICAgICAgICAgICAgcnVuOiBgbnBtIGluc3RhbGwgLS1uby1zYXZlIGNkay1hc3NldHMke2luc3RhbGxTdWZmaXh9YCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC4uLnRoaXMuc3RlcHNUb0NvbmZpZ3VyZUF3cyh0aGlzLnB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uKSxcbiAgICAgICAgICAuLi5kb2NrZXJMb2dpblN0ZXBzLFxuICAgICAgICAgIHB1Ymxpc2hTdGVwLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBqb2JGb3JEZXBsb3kobm9kZTogQUdyYXBoTm9kZSwgc3RhY2s6IFN0YWNrRGVwbG95bWVudCwgX2NhcHR1cmVPdXRwdXRzOiBib29sZWFuKTogSm9iIHtcbiAgICBjb25zdCByZWdpb24gPSBzdGFjay5yZWdpb247XG4gICAgY29uc3QgYWNjb3VudCA9IHN0YWNrLmFjY291bnQ7XG4gICAgaWYgKCFyZWdpb24gfHwgIWFjY291bnQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignXCJhY2NvdW50XCIgYW5kIFwicmVnaW9uXCIgYXJlIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgaWYgKCFzdGFjay50ZW1wbGF0ZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGB1bmFibGUgdG8gZGV0ZXJtaW5lIHRlbXBsYXRlIFVSTCBmb3Igc3RhY2sgJHtzdGFjay5zdGFja0FydGlmYWN0SWR9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZSA9IChzOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgcmV0dXJuIEVudmlyb25tZW50UGxhY2Vob2xkZXJzLnJlcGxhY2Uocywge1xuICAgICAgICBhY2NvdW50SWQ6IGFjY291bnQsXG4gICAgICAgIHJlZ2lvbjogcmVnaW9uLFxuICAgICAgICBwYXJ0aXRpb246ICdhd3MnLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHJlcGxhY2VBc3NldEhhc2ggPSAodGVtcGxhdGU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgaGFzaCA9IHBhdGgucGFyc2UodGVtcGxhdGUuc3BsaXQoJy8nKS5wb3AoKSA/PyAnJykubmFtZTtcbiAgICAgIGlmICh0aGlzLmFzc2V0SGFzaE1hcFtoYXNoXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGVtcGxhdGUgYXNzZXQgaGFzaCAke2hhc2h9IG5vdCBmb3VuZC5gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZW1wbGF0ZS5yZXBsYWNlKGhhc2gsIGBcXCR7eyBuZWVkcy4ke3RoaXMuYXNzZXRIYXNoTWFwW2hhc2hdfS5vdXRwdXRzLiR7QVNTRVRfSEFTSF9OQU1FfSB9fWApO1xuICAgIH07XG5cbiAgICBjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgICAnbmFtZSc6IHN0YWNrLnN0YWNrTmFtZSxcbiAgICAgICd0ZW1wbGF0ZSc6IHJlcGxhY2VBc3NldEhhc2gocmVzb2x2ZShzdGFjay50ZW1wbGF0ZVVybCkpLFxuICAgICAgJ25vLWZhaWwtb24tZW1wdHktY2hhbmdlc2V0JzogJzEnLFxuICAgIH07XG5cbiAgICBjb25zdCBjYXBhYmlsaXRpZXMgPSB0aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5jYXBhYmlsaXRpZXM7XG4gICAgaWYgKGNhcGFiaWxpdGllcykge1xuICAgICAgcGFyYW1zLmNhcGFiaWxpdGllcyA9IEFycmF5KGNhcGFiaWxpdGllcykuam9pbignLCcpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5leGVjdXRpb25Sb2xlQXJuKSB7XG4gICAgICBwYXJhbXNbJ3JvbGUtYXJuJ10gPSByZXNvbHZlKHN0YWNrLmV4ZWN1dGlvblJvbGVBcm4pO1xuICAgIH1cbiAgICBjb25zdCBhc3N1bWVSb2xlQXJuID0gc3RhY2suYXNzdW1lUm9sZUFybiA/IHJlc29sdmUoc3RhY2suYXNzdW1lUm9sZUFybikgOiB1bmRlZmluZWQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG5vZGUudW5pcXVlSWQsXG4gICAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIG5hbWU6IGBEZXBsb3kgJHtzdGFjay5zdGFja0FydGlmYWN0SWR9YCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICAuLi50aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5zZXR0aW5ncyxcbiAgICAgICAgcGVybWlzc2lvbnM6IHtcbiAgICAgICAgICBjb250ZW50czogZ2l0aHViLkpvYlBlcm1pc3Npb24uUkVBRCxcbiAgICAgICAgICBpZFRva2VuOiB0aGlzLmF3c0NyZWRlbnRpYWxzLmpvYlBlcm1pc3Npb24oKSxcbiAgICAgICAgfSxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJHaXRIdWJFbnZpcm9ubWVudCh0aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5lbnZpcm9ubWVudCksXG4gICAgICAgIG5lZWRzOiB0aGlzLnJlbmRlckRlcGVuZGVuY2llcyhub2RlKSxcbiAgICAgICAgcnVuc09uOiB0aGlzLnJ1bm5lci5ydW5zT24sXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4udGhpcy5zdGVwc1RvQ29uZmlndXJlQXdzKHJlZ2lvbiwgYXNzdW1lUm9sZUFybiksXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdEZXBsb3knLFxuICAgICAgICAgICAgdXNlczogJ2F3cy1hY3Rpb25zL2F3cy1jbG91ZGZvcm1hdGlvbi1naXRodWItZGVwbG95QHYxLjIuMCcsXG4gICAgICAgICAgICB3aXRoOiBwYXJhbXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgam9iRm9yQnVpbGRTdGVwKG5vZGU6IEFHcmFwaE5vZGUsIHN0ZXA6IFN0ZXApOiBKb2Ige1xuICAgIGlmICghKHN0ZXAgaW5zdGFuY2VvZiBTaGVsbFN0ZXApKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N5bnRoU3RlcCBtdXN0IGJlIGEgU2NyaXB0U3RlcCcpO1xuICAgIH1cblxuICAgIGlmIChzdGVwLmlucHV0cy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N5bnRoU3RlcCBjYW5ub3QgaGF2ZSBpbnB1dHMnKTtcbiAgICB9XG5cbiAgICBpZiAoc3RlcC5vdXRwdXRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3ludGhTdGVwIG11c3QgaGF2ZSBhIHNpbmdsZSBvdXRwdXQnKTtcbiAgICB9XG5cbiAgICBpZiAoIXN0ZXAucHJpbWFyeU91dHB1dCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzeW50aFN0ZXAgcmVxdWlyZXMgYSBwcmltYXJ5T3V0cHV0IHdoaWNoIGNvbnRhaW5zIGNkay5vdXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBjZGtPdXQgPSBzdGVwLm91dHB1dHNbMF07XG5cbiAgICBjb25zdCBpbnN0YWxsU3RlcHMgPSBzdGVwLmluc3RhbGxDb21tYW5kcy5sZW5ndGggPiAwID8gW3tcbiAgICAgIG5hbWU6ICdJbnN0YWxsJyxcbiAgICAgIHJ1bjogc3RlcC5pbnN0YWxsQ29tbWFuZHMuam9pbignXFxuJyksXG4gICAgfV0gOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZDogbm9kZS51bmlxdWVJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogJ1N5bnRoZXNpemUnLFxuICAgICAgICAuLi50aGlzLnJlbmRlckpvYlNldHRpbmdQYXJhbWV0ZXJzKCksXG4gICAgICAgIHBlcm1pc3Npb25zOiB7XG4gICAgICAgICAgY29udGVudHM6IGdpdGh1Yi5Kb2JQZXJtaXNzaW9uLlJFQUQsXG4gICAgICAgICAgLy8gVGhlIFN5bnRoZXNpemUgam9iIGRvZXMgbm90IHVzZSB0aGUgR2l0SHViIEFjdGlvbiBSb2xlIG9uIGl0cyBvd24sIGJ1dCBpdCdzIHBvc3NpYmxlXG4gICAgICAgICAgLy8gdGhhdCBpdCBpcyBiZWluZyB1c2VkIGluIHRoZSBwcmVCdWlsZFN0ZXBzLlxuICAgICAgICAgIGlkVG9rZW46IHRoaXMuYXdzQ3JlZGVudGlhbHMuam9iUGVybWlzc2lvbigpLFxuICAgICAgICB9LFxuICAgICAgICBydW5zT246IHRoaXMucnVubmVyLnJ1bnNPbixcbiAgICAgICAgbmVlZHM6IHRoaXMucmVuZGVyRGVwZW5kZW5jaWVzKG5vZGUpLFxuICAgICAgICBlbnY6IHN0ZXAuZW52LFxuICAgICAgICBjb250YWluZXI6IHRoaXMuYnVpbGRDb250YWluZXIsXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4udGhpcy5zdGVwc1RvQ2hlY2tvdXQoKSxcbiAgICAgICAgICAuLi50aGlzLnByZUJ1aWxkU3RlcHMsXG4gICAgICAgICAgLi4uaW5zdGFsbFN0ZXBzLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgICBydW46IHN0ZXAuY29tbWFuZHMuam9pbignXFxuJyksXG4gICAgICAgICAgfSxcbiAgICAgICAgICAuLi50aGlzLnBvc3RCdWlsZFN0ZXBzLFxuICAgICAgICAgIC4uLnRoaXMuc3RlcHNUb1VwbG9hZEFzc2VtYmx5KGNka091dC5kaXJlY3RvcnkpLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNlYXJjaGVzIGZvciB0aGUgc3RhY2sgdGhhdCBwcm9kdWNlZCB0aGUgb3V0cHV0IHZpYSB0aGUgY3VycmVudFxuICAgKiBqb2IncyBkZXBlbmRlbmNpZXMuXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gc2hvdWxkIGFsd2F5cyBmaW5kIGEgc3RhY2ssIHNpbmNlIGl0IGlzIGd1YXJhbnRlZWRcbiAgICogdGhhdCBhIENmbk91dHB1dCBjb21lcyBmcm9tIGEgcmVmZXJlbmNlZCBzdGFjay5cbiAgICovXG4gIHByaXZhdGUgZmluZFN0YWNrT2ZPdXRwdXQocmVmOiBTdGFja091dHB1dFJlZmVyZW5jZSwgbm9kZTogQUdyYXBoTm9kZSkge1xuICAgIGZvciAoY29uc3QgZGVwIG9mIG5vZGUuYWxsRGVwcykge1xuICAgICAgaWYgKGRlcC5kYXRhPy50eXBlID09PSAnZXhlY3V0ZScgJiYgcmVmLmlzUHJvZHVjZWRCeShkZXAuZGF0YS5zdGFjaykpIHtcbiAgICAgICAgcmV0dXJuIGRlcC51bmlxdWVJZDtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gU2hvdWxkIG5ldmVyIGhhcHBlblxuICAgIHRocm93IG5ldyBFcnJvcihgVGhlIG91dHB1dCAke3JlZi5vdXRwdXROYW1lfSBpcyBub3QgcmVmZXJlbmNlZCBieSBhbnkgb2YgdGhlIGRlcGVuZGVudCBzdGFja3MhYCk7XG4gIH1cblxuICBwcml2YXRlIGFkZEpvYk91dHB1dChqb2JJZDogc3RyaW5nLCBvdXRwdXQ6IGdpdGh1Yi5Kb2JTdGVwT3V0cHV0KSB7XG4gICAgaWYgKHRoaXMuam9iT3V0cHV0c1tqb2JJZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5qb2JPdXRwdXRzW2pvYklkXSA9IFtvdXRwdXRdO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmpvYk91dHB1dHNbam9iSWRdLnB1c2gob3V0cHV0KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGpvYkZvclNjcmlwdFN0ZXAobm9kZTogQUdyYXBoTm9kZSwgc3RlcDogU2hlbGxTdGVwKTogSm9iIHtcbiAgICBjb25zdCBlbnZWYXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtlbnZOYW1lLCByZWZdIG9mIE9iamVjdC5lbnRyaWVzKHN0ZXAuZW52RnJvbUNmbk91dHB1dHMpKSB7XG4gICAgICBjb25zdCBqb2JJZCA9IHRoaXMuZmluZFN0YWNrT2ZPdXRwdXQocmVmLCBub2RlKTtcbiAgICAgIHRoaXMuYWRkSm9iT3V0cHV0KGpvYklkLCB7XG4gICAgICAgIG91dHB1dE5hbWU6IHJlZi5vdXRwdXROYW1lLFxuICAgICAgICBzdGVwSWQ6ICdEZXBsb3knLFxuICAgICAgfSk7XG4gICAgICBlbnZWYXJpYWJsZXNbZW52TmFtZV0gPSBgXFwke3sgbmVlZHMuJHtqb2JJZH0ub3V0cHV0cy4ke3JlZi5vdXRwdXROYW1lfSB9fWA7XG4gICAgfVxuXG4gICAgY29uc3QgZG93bmxvYWRJbnB1dHMgPSBuZXcgQXJyYXk8Z2l0aHViLkpvYlN0ZXA+KCk7XG4gICAgY29uc3QgdXBsb2FkT3V0cHV0cyA9IG5ldyBBcnJheTxnaXRodWIuSm9iU3RlcD4oKTtcblxuICAgIGZvciAoY29uc3QgaW5wdXQgb2Ygc3RlcC5pbnB1dHMpIHtcbiAgICAgIGRvd25sb2FkSW5wdXRzLnB1c2goe1xuICAgICAgICB1c2VzOiAnYWN0aW9ucy9kb3dubG9hZC1hcnRpZmFjdEB2MycsXG4gICAgICAgIHdpdGg6IHtcbiAgICAgICAgICBuYW1lOiBpbnB1dC5maWxlU2V0LmlkLFxuICAgICAgICAgIHBhdGg6IGlucHV0LmRpcmVjdG9yeSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgb3V0cHV0IG9mIHN0ZXAub3V0cHV0cykge1xuICAgICAgdXBsb2FkT3V0cHV0cy5wdXNoKHtcbiAgICAgICAgdXNlczogJ2FjdGlvbnMvdXBsb2FkLWFydGlmYWN0QHYzJyxcbiAgICAgICAgd2l0aDoge1xuICAgICAgICAgIG5hbWU6IG91dHB1dC5maWxlU2V0LmlkLFxuICAgICAgICAgIHBhdGg6IG91dHB1dC5kaXJlY3RvcnksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbnN0YWxsU3RlcHMgPSBzdGVwLmluc3RhbGxDb21tYW5kcy5sZW5ndGggPiAwID8gW3tcbiAgICAgIG5hbWU6ICdJbnN0YWxsJyxcbiAgICAgIHJ1bjogc3RlcC5pbnN0YWxsQ29tbWFuZHMuam9pbignXFxuJyksXG4gICAgfV0gOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZDogbm9kZS51bmlxdWVJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogc3RlcC5pZCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICBwZXJtaXNzaW9uczoge1xuICAgICAgICAgIGNvbnRlbnRzOiBnaXRodWIuSm9iUGVybWlzc2lvbi5SRUFELFxuICAgICAgICB9LFxuICAgICAgICBydW5zT246IHRoaXMucnVubmVyLnJ1bnNPbixcbiAgICAgICAgbmVlZHM6IHRoaXMucmVuZGVyRGVwZW5kZW5jaWVzKG5vZGUpLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICAuLi5zdGVwLmVudixcbiAgICAgICAgICAuLi5lbnZWYXJpYWJsZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4uZG93bmxvYWRJbnB1dHMsXG4gICAgICAgICAgLi4uaW5zdGFsbFN0ZXBzLFxuICAgICAgICAgIHsgcnVuOiBzdGVwLmNvbW1hbmRzLmpvaW4oJ1xcbicpIH0sXG4gICAgICAgICAgLi4udXBsb2FkT3V0cHV0cyxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgam9iRm9yR2l0SHViQWN0aW9uU3RlcChub2RlOiBBR3JhcGhOb2RlLCBzdGVwOiBHaXRIdWJBY3Rpb25TdGVwKTogSm9iIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG5vZGUudW5pcXVlSWQsXG4gICAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIG5hbWU6IHN0ZXAuaWQsXG4gICAgICAgIC4uLnRoaXMucmVuZGVySm9iU2V0dGluZ1BhcmFtZXRlcnMoKSxcbiAgICAgICAgcGVybWlzc2lvbnM6IHtcbiAgICAgICAgICBjb250ZW50czogZ2l0aHViLkpvYlBlcm1pc3Npb24uV1JJVEUsXG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnNPbjogdGhpcy5ydW5uZXIucnVuc09uLFxuICAgICAgICBuZWVkczogdGhpcy5yZW5kZXJEZXBlbmRlbmNpZXMobm9kZSksXG4gICAgICAgIGVudjogc3RlcC5lbnYsXG4gICAgICAgIHN0ZXBzOiBzdGVwLmpvYlN0ZXBzLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzdGVwc1RvQ29uZmlndXJlQXdzKHJlZ2lvbjogc3RyaW5nLCBhc3N1bWVSb2xlQXJuPzogc3RyaW5nKTogZ2l0aHViLkpvYlN0ZXBbXSB7XG4gICAgcmV0dXJuIHRoaXMuYXdzQ3JlZGVudGlhbHMuY3JlZGVudGlhbFN0ZXBzKHJlZ2lvbiwgYXNzdW1lUm9sZUFybik7XG4gIH1cblxuICBwcml2YXRlIHN0ZXBzVG9Db25maWd1cmVEb2NrZXIoZG9ja2VyQ3JlZGVudGlhbDogRG9ja2VyQ3JlZGVudGlhbCk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIGxldCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT47XG5cbiAgICBpZiAoZG9ja2VyQ3JlZGVudGlhbC5uYW1lID09PSAnZG9ja2VyJykge1xuICAgICAgcGFyYW1zID0ge1xuICAgICAgICB1c2VybmFtZTogYFxcJHt7IHNlY3JldHMuJHtkb2NrZXJDcmVkZW50aWFsLnVzZXJuYW1lS2V5fSB9fWAsXG4gICAgICAgIHBhc3N3b3JkOiBgXFwke3sgc2VjcmV0cy4ke2RvY2tlckNyZWRlbnRpYWwucGFzc3dvcmRLZXl9IH19YCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChkb2NrZXJDcmVkZW50aWFsLm5hbWUgPT09ICdlY3InKSB7XG4gICAgICBwYXJhbXMgPSB7XG4gICAgICAgIHJlZ2lzdHJ5OiBkb2NrZXJDcmVkZW50aWFsLnJlZ2lzdHJ5LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyYW1zID0ge1xuICAgICAgICByZWdpc3RyeTogZG9ja2VyQ3JlZGVudGlhbC5yZWdpc3RyeSxcbiAgICAgICAgdXNlcm5hbWU6IGBcXCR7eyBzZWNyZXRzLiR7ZG9ja2VyQ3JlZGVudGlhbC51c2VybmFtZUtleX0gfX1gLFxuICAgICAgICBwYXNzd29yZDogYFxcJHt7IHNlY3JldHMuJHtkb2NrZXJDcmVkZW50aWFsLnBhc3N3b3JkS2V5fSB9fWAsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIHVzZXM6ICdkb2NrZXIvbG9naW4tYWN0aW9uQHYyJyxcbiAgICAgICAgd2l0aDogcGFyYW1zLFxuICAgICAgfSxcbiAgICBdO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGVwc1RvRG93bmxvYWRBc3NlbWJseSh0YXJnZXREaXI6IHN0cmluZyk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIGlmICh0aGlzLnByZVN5bnRoZWQpIHtcbiAgICAgIHJldHVybiB0aGlzLnN0ZXBzVG9DaGVja291dCgpO1xuICAgIH1cblxuICAgIHJldHVybiBbe1xuICAgICAgbmFtZTogYERvd25sb2FkICR7Q0RLT1VUX0FSVElGQUNUfWAsXG4gICAgICB1c2VzOiAnYWN0aW9ucy9kb3dubG9hZC1hcnRpZmFjdEB2MycsXG4gICAgICB3aXRoOiB7XG4gICAgICAgIG5hbWU6IENES09VVF9BUlRJRkFDVCxcbiAgICAgICAgcGF0aDogdGFyZ2V0RGlyLFxuICAgICAgfSxcbiAgICB9XTtcbiAgfVxuXG4gIHByaXZhdGUgc3RlcHNUb0NoZWNrb3V0KCk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdDaGVja291dCcsXG4gICAgICAgIHVzZXM6ICdhY3Rpb25zL2NoZWNrb3V0QHYzJyxcbiAgICAgIH0sXG4gICAgXTtcbiAgfVxuXG4gIHByaXZhdGUgc3RlcHNUb1VwbG9hZEFzc2VtYmx5KGRpcjogc3RyaW5nKTogZ2l0aHViLkpvYlN0ZXBbXSB7XG4gICAgaWYgKHRoaXMucHJlU3ludGhlZCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHJldHVybiBbe1xuICAgICAgbmFtZTogYFVwbG9hZCAke0NES09VVF9BUlRJRkFDVH1gLFxuICAgICAgdXNlczogJ2FjdGlvbnMvdXBsb2FkLWFydGlmYWN0QHYzJyxcbiAgICAgIHdpdGg6IHtcbiAgICAgICAgbmFtZTogQ0RLT1VUX0FSVElGQUNULFxuICAgICAgICBwYXRoOiBkaXIsXG4gICAgICB9LFxuICAgIH1dO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJEZXBlbmRlbmNpZXMobm9kZTogQUdyYXBoTm9kZSkge1xuICAgIGNvbnN0IGRlcHMgPSBuZXcgQXJyYXk8QUdyYXBoTm9kZT4oKTtcblxuICAgIGZvciAoY29uc3QgZCBvZiBub2RlLmFsbERlcHMpIHtcbiAgICAgIGlmIChkIGluc3RhbmNlb2YgR3JhcGgpIHtcbiAgICAgICAgZGVwcy5wdXNoKC4uLmQuYWxsTGVhdmVzKCkubm9kZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVwcy5wdXNoKGQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkZXBzLm1hcCh4ID0+IHgudW5pcXVlSWQpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpIHtcbiAgICByZXR1cm4gdGhpcy5qb2JTZXR0aW5ncztcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyR2l0SHViRW52aXJvbm1lbnQoZW52aXJvbm1lbnQ/OiBHaXRIdWJFbnZpcm9ubWVudCkge1xuICAgIGlmICghZW52aXJvbm1lbnQpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gICAgaWYgKGVudmlyb25tZW50LnVybCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4geyBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQubmFtZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBlbnZpcm9ubWVudCB9O1xuICB9XG59XG5cbmludGVyZmFjZSBDb250ZXh0IHtcbiAgLyoqXG4gICAqIFRoZSBwaXBlbGluZSBncmFwaC5cbiAgICovXG4gIHJlYWRvbmx5IHN0cnVjdHVyZTogUGlwZWxpbmVHcmFwaDtcblxuICAvKipcbiAgICogTmFtZSBvZiBjbG91ZCBhc3NlbWJseSBkaXJlY3RvcnkuXG4gICAqL1xuICByZWFkb25seSBhc3NlbWJseURpcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSm9iIHtcbiAgcmVhZG9ubHkgaWQ6IHN0cmluZztcbiAgcmVhZG9ubHkgZGVmaW5pdGlvbjogZ2l0aHViLkpvYjtcbn1cblxuZnVuY3Rpb24gc25ha2VDYXNlS2V5czxUID0gdW5rbm93bj4ob2JqOiBULCBzZXAgPSAnLScpOiBUIHtcbiAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PSBudWxsKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcbiAgICByZXR1cm4gb2JqLm1hcChvID0+IHNuYWtlQ2FzZUtleXMobywgc2VwKSkgYXMgYW55O1xuICB9XG5cbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuICBmb3IgKGxldCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gc25ha2UgY2FzZSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBpZiAoayAhPT0gJ2VudicgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnICYmIHYgIT0gbnVsbCkge1xuICAgICAgdiA9IHNuYWtlQ2FzZUtleXModik7XG4gICAgfVxuICAgIHJlc3VsdFtkZWNhbWVsaXplKGssIHsgc2VwYXJhdG9yOiBzZXAgfSldID0gdjtcbiAgfVxuICByZXR1cm4gcmVzdWx0IGFzIGFueTtcbn1cblxuLyoqXG4gKiBOYW1lcyBvZiBzZWNyZXRzIGZvciBBV1MgY3JlZGVudGlhbHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXdzQ3JlZGVudGlhbHNTZWNyZXRzIHtcbiAgLyoqXG4gICAqIEBkZWZhdWx0IFwiQVdTX0FDQ0VTU19LRVlfSURcIlxuICAgKi9cbiAgcmVhZG9ubHkgYWNjZXNzS2V5SWQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IFwiQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZXCJcbiAgICovXG4gIHJlYWRvbmx5IHNlY3JldEFjY2Vzc0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogQGRlZmF1bHQgLSBubyBzZXNzaW9uIHRva2VuIGlzIHVzZWRcbiAgICovXG4gIHJlYWRvbmx5IHNlc3Npb25Ub2tlbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uKiBmbGF0dGVuPEE+KHhzOiBJdGVyYWJsZTxBW10+KTogSXRlcmFibGVJdGVyYXRvcjxBPiB7XG4gIGZvciAoY29uc3QgeCBvZiB4cykge1xuICAgIGZvciAoY29uc3QgeSBvZiB4KSB7XG4gICAgICB5aWVsZCB5O1xuICAgIH1cbiAgfVxufVxuIl19