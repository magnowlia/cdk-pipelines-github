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
        const jobId = `${aws_cdk_lib_1.Names.uniqueId(this)}-${node.uniqueId}`;
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
        const publishStepFile = path.join(cdkoutDir, `publish-${jobId}-step.sh`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvcGlwZWxpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSwyQkFBd0U7QUFDeEUsNkJBQTZCO0FBQzdCLDZDQUEyQztBQUMzQywrQ0FBNkQ7QUFDN0QscURBQWdMO0FBQ2hMLGlGQUF1RztBQUV2Ryx5Q0FBeUM7QUFDekMsdURBQTJFO0FBRzNFLG1DQUFzQztBQUN0QyxtRUFBOEQ7QUFDOUQsaUNBQW9DO0FBQ3BDLDRDQUE0QztBQUM1QywyQ0FBdUM7QUFFdkMsTUFBTSxlQUFlLEdBQUcsU0FBUyxDQUFDO0FBQ2xDLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQztBQTZJckM7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSx3QkFBWTtJQThCOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQWxCVCxlQUFVLEdBQTJDLEVBQUUsQ0FBQztRQUN4RCxpQkFBWSxHQUEyQixFQUFFLENBQUM7UUFHMUMsb0JBQWUsR0FPNUIsRUFBRSxDQUFDO1FBRVAsc0VBQXNFO1FBQ3RFLCtDQUErQztRQUN2QyxZQUFPLEdBQUcsS0FBSyxDQUFDO1FBS3RCLElBQUksQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztRQUN6QyxJQUFJLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLElBQUksS0FBSyxDQUFDO1FBQzVDLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQztRQUMzQyxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDO1FBQy9DLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDakQsSUFBSSxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUMs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QWEsQ0FBYyxHQUFNLEVBQUUsR0FBRyxHQUFHLEdBQUc7SUFDbkQsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLElBQUksR0FBRyxJQUFJLElBQUksRUFBRTtRQUMxQyxPQUFPLEdBQUcsQ0FBQztLQUNaO0lBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ3RCLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQVEsQ0FBQztLQUNuRDtJQUVELE1BQU0sTUFBTSxHQUE0QixFQUFFLENBQUM7SUFDM0MsS0FBSyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7UUFDdEMsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRTtZQUNyRCxDQUFDLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3RCO1FBQ0QsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztLQUMvQztJQUNELE9BQU8sTUFBYSxDQUFDO0FBQ3ZCLENBQUM7QUFzQkQsUUFBZSxDQUFDLENBQUMsT0FBTyxDQUFJLEVBQWlCO0lBQzNDLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO1FBQ2xCLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ2pCLE1BQU0sQ0FBQyxDQUFDO1NBQ1Q7S0FDRjtBQUNILENBQUM7QUFORCwwQkFNQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IG1rZGlyU3luYywgd3JpdGVGaWxlU3luYywgcmVhZEZpbGVTeW5jLCBleGlzdHNTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IE5hbWVzLCBTdGFnZSB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEVudmlyb25tZW50UGxhY2Vob2xkZXJzIH0gZnJvbSAnYXdzLWNkay1saWIvY3gtYXBpJztcbmltcG9ydCB7IFBpcGVsaW5lQmFzZSwgUGlwZWxpbmVCYXNlUHJvcHMsIFNoZWxsU3RlcCwgU3RhY2tBc3NldCwgU3RhY2tEZXBsb3ltZW50LCBTdGFja091dHB1dFJlZmVyZW5jZSwgU3RhZ2VEZXBsb3ltZW50LCBTdGVwLCBXYXZlLCBXYXZlT3B0aW9ucyB9IGZyb20gJ2F3cy1jZGstbGliL3BpcGVsaW5lcyc7XG5pbXBvcnQgeyBBR3JhcGhOb2RlLCBQaXBlbGluZUdyYXBoLCBHcmFwaCwgaXNHcmFwaCB9IGZyb20gJ2F3cy1jZGstbGliL3BpcGVsaW5lcy9saWIvaGVscGVycy1pbnRlcm5hbCc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGRlY2FtZWxpemUgZnJvbSAnZGVjYW1lbGl6ZSc7XG5pbXBvcnQgeyBBd3NDcmVkZW50aWFscywgQXdzQ3JlZGVudGlhbHNQcm92aWRlciB9IGZyb20gJy4vYXdzLWNyZWRlbnRpYWxzJztcbmltcG9ydCB7IERvY2tlckNyZWRlbnRpYWwgfSBmcm9tICcuL2RvY2tlci1jcmVkZW50aWFscyc7XG5pbXBvcnQgeyBBZGRHaXRIdWJTdGFnZU9wdGlvbnMsIEdpdEh1YkVudmlyb25tZW50IH0gZnJvbSAnLi9naXRodWItY29tbW9uJztcbmltcG9ydCB7IEdpdEh1YlN0YWdlIH0gZnJvbSAnLi9zdGFnZSc7XG5pbXBvcnQgeyBHaXRIdWJBY3Rpb25TdGVwIH0gZnJvbSAnLi9zdGVwcy9naXRodWItYWN0aW9uLXN0ZXAnO1xuaW1wb3J0IHsgR2l0SHViV2F2ZSB9IGZyb20gJy4vd2F2ZSc7XG5pbXBvcnQgKiBhcyBnaXRodWIgZnJvbSAnLi93b3JrZmxvd3MtbW9kZWwnO1xuaW1wb3J0IHsgWWFtbEZpbGUgfSBmcm9tICcuL3lhbWwtZmlsZSc7XG5cbmNvbnN0IENES09VVF9BUlRJRkFDVCA9ICdjZGsub3V0JztcbmNvbnN0IEFTU0VUX0hBU0hfTkFNRSA9ICdhc3NldC1oYXNoJztcblxuLyoqXG4gKiBKb2IgbGV2ZWwgc2V0dGluZ3MgYXBwbGllZCB0byBhbGwgam9icyBpbiB0aGUgd29ya2Zsb3cuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSm9iU2V0dGluZ3Mge1xuICAvKipcbiAgICogam9icy48am9iX2lkPi5pZi5cbiAgICpcbiAgICogQHNlZSBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9hY3Rpb25zL3VzaW5nLXdvcmtmbG93cy93b3JrZmxvdy1zeW50YXgtZm9yLWdpdGh1Yi1hY3Rpb25zI2pvYnNqb2JfaWRpZlxuICAgKi9cbiAgcmVhZG9ubHkgaWY/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUHJvcHMgZm9yIGBHaXRIdWJXb3JrZmxvd2AuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgR2l0SHViV29ya2Zsb3dQcm9wcyBleHRlbmRzIFBpcGVsaW5lQmFzZVByb3BzIHtcbiAgLyoqXG4gICAqIEZpbGUgcGF0aCBmb3IgdGhlIEdpdEh1YiB3b3JrZmxvdy5cbiAgICpcbiAgICogQGRlZmF1bHQgXCIuZ2l0aHViL3dvcmtmbG93cy9kZXBsb3kueW1sXCJcbiAgICovXG4gIHJlYWRvbmx5IHdvcmtmbG93UGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogTmFtZSBvZiB0aGUgd29ya2Zsb3cuXG4gICAqXG4gICAqIEBkZWZhdWx0IFwiZGVwbG95XCJcbiAgICovXG4gIHJlYWRvbmx5IHdvcmtmbG93TmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogR2l0SHViIHdvcmtmbG93IHRyaWdnZXJzLlxuICAgKlxuICAgKiBAZGVmYXVsdCAtIEJ5IGRlZmF1bHQsIHdvcmtmbG93IGlzIHRyaWdnZXJlZCBvbiBwdXNoIHRvIHRoZSBgbWFpbmAgYnJhbmNoXG4gICAqIGFuZCBjYW4gYWxzbyBiZSB0cmlnZ2VyZWQgbWFudWFsbHkgKGB3b3JrZmxvd19kaXNwYXRjaGApLlxuICAgKi9cbiAgcmVhZG9ubHkgd29ya2Zsb3dUcmlnZ2Vycz86IGdpdGh1Yi5Xb3JrZmxvd1RyaWdnZXJzO1xuXG4gIC8qKlxuICAgKiBWZXJzaW9uIG9mIHRoZSBDREsgQ0xJIHRvIHVzZS5cbiAgICogQGRlZmF1bHQgLSBhdXRvbWF0aWNcbiAgICovXG4gIHJlYWRvbmx5IGNka0NsaVZlcnNpb24/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEluZGljYXRlcyBpZiB0aGUgcmVwb3NpdG9yeSBhbHJlYWR5IGNvbnRhaW5zIGEgc3ludGhlc2l6ZWQgYGNkay5vdXRgIGRpcmVjdG9yeSwgaW4gd2hpY2hcbiAgICogY2FzZSB3ZSB3aWxsIHNpbXBseSBjaGVja291dCB0aGUgcmVwbyBpbiBqb2JzIHRoYXQgcmVxdWlyZSBgY2RrLm91dGAuXG4gICAqXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBwcmVTeW50aGVkPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogQ29uZmlndXJlIHByb3ZpZGVyIGZvciBBV1MgY3JlZGVudGlhbHMgdXNlZCBmb3IgZGVwbG95bWVudC5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBHZXQgQVdTIGNyZWRlbnRpYWxzIGZyb20gR2l0SHViIHNlY3JldHMgYEFXU19BQ0NFU1NfS0VZX0lEYCBhbmQgYEFXU19TRUNSRVRfQUNDRVNTX0tFWWAuXG4gICAqL1xuICByZWFkb25seSBhd3NDcmVkcz86IEF3c0NyZWRlbnRpYWxzUHJvdmlkZXI7XG5cbiAgLyoqXG4gICAqIE5hbWVzIG9mIEdpdEh1YiByZXBvc2l0b3J5IHNlY3JldHMgdGhhdCBpbmNsdWRlIEFXUyBjcmVkZW50aWFscyBmb3JcbiAgICogZGVwbG95bWVudC5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBgQVdTX0FDQ0VTU19LRVlfSURgIGFuZCBgQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZYC5cbiAgICpcbiAgICogQGRlcHJlY2F0ZWQgVXNlIGBhd3NDcmVkcy5mcm9tR2l0SHViU2VjcmV0cygpYCBpbnN0ZWFkLlxuICAgKi9cbiAgcmVhZG9ubHkgYXdzQ3JlZGVudGlhbHM/OiBBd3NDcmVkZW50aWFsc1NlY3JldHM7XG5cbiAgLyoqXG4gICAqIEEgcm9sZSB0aGF0IHV0aWxpemVzIHRoZSBHaXRIdWIgT0lEQyBJZGVudGl0eSBQcm92aWRlciBpbiB5b3VyIEFXUyBhY2NvdW50LlxuICAgKiBJZiBzdXBwbGllZCwgdGhpcyB3aWxsIGJlIHVzZWQgaW5zdGVhZCBvZiBgYXdzQ3JlZGVudGlhbHNgLlxuICAgKlxuICAgKiBZb3UgY2FuIGNyZWF0ZSB5b3VyIG93biByb2xlIGluIHRoZSBjb25zb2xlIHdpdGggdGhlIG5lY2Vzc2FyeSB0cnVzdCBwb2xpY3lcbiAgICogdG8gYWxsb3cgZ2l0SHViIGFjdGlvbnMgZnJvbSB5b3VyIGdpdEh1YiByZXBvc2l0b3J5IHRvIGFzc3VtZSB0aGUgcm9sZSwgb3JcbiAgICogeW91IGNhbiB1dGlsaXplIHRoZSBgR2l0SHViQWN0aW9uUm9sZWAgY29uc3RydWN0IHRvIGNyZWF0ZSBhIHJvbGUgZm9yIHlvdS5cbiAgICpcbiAgICogQGRlZmF1bHQgLSBHaXRIdWIgcmVwb3NpdG9yeSBzZWNyZXRzIGFyZSB1c2VkIGluc3RlYWQgb2YgT3BlbklkIENvbm5lY3Qgcm9sZS5cbiAgICpcbiAgICogQGRlcHJlY2F0ZWQgVXNlIGBhd3NDcmVkcy5mcm9tT3BlbklkQ29ubmVjdCgpYCBpbnN0ZWFkLlxuICAgKi9cbiAgcmVhZG9ubHkgZ2l0SHViQWN0aW9uUm9sZUFybj86IHN0cmluZztcblxuICAvKipcbiAgICogQnVpbGQgY29udGFpbmVyIG9wdGlvbnMuXG4gICAqXG4gICAqIEBkZWZhdWx0IC0gR2l0SHViIGRlZmF1bHRzXG4gICAqL1xuICByZWFkb25seSBidWlsZENvbnRhaW5lcj86IGdpdGh1Yi5Db250YWluZXJPcHRpb25zO1xuXG4gIC8qKlxuICAgKiBHaXRIdWIgd29ya2Zsb3cgc3RlcHMgdG8gZXhlY3V0ZSBiZWZvcmUgYnVpbGQuXG4gICAqXG4gICAqIEBkZWZhdWx0IFtdXG4gICAqL1xuICByZWFkb25seSBwcmVCdWlsZFN0ZXBzPzogZ2l0aHViLkpvYlN0ZXBbXTtcblxuICAvKipcbiAgICogR2l0SHViIHdvcmtmbG93IHN0ZXBzIHRvIGV4ZWN1dGUgYWZ0ZXIgYnVpbGQuXG4gICAqXG4gICAqIEBkZWZhdWx0IFtdXG4gICAqL1xuICByZWFkb25seSBwb3N0QnVpbGRTdGVwcz86IGdpdGh1Yi5Kb2JTdGVwW107XG5cbiAgLyoqXG4gICAqIFRoZSBEb2NrZXIgQ3JlZGVudGlhbHMgdG8gdXNlIHRvIGxvZ2luLiBJZiB5b3Ugc2V0IHRoaXMgdmFyaWFibGUsXG4gICAqIHlvdSB3aWxsIGJlIGxvZ2dlZCBpbiB0byBkb2NrZXIgd2hlbiB5b3UgdXBsb2FkIERvY2tlciBBc3NldHMuXG4gICAqL1xuICByZWFkb25seSBkb2NrZXJDcmVkZW50aWFscz86IERvY2tlckNyZWRlbnRpYWxbXTtcblxuICAvKipcbiAgICogVGhlIHR5cGUgb2YgcnVubmVyIHRvIHJ1biB0aGUgam9iIG9uLiBUaGUgcnVubmVyIGNhbiBiZSBlaXRoZXIgYVxuICAgKiBHaXRIdWItaG9zdGVkIHJ1bm5lciBvciBhIHNlbGYtaG9zdGVkIHJ1bm5lci5cbiAgICpcbiAgICogQGRlZmF1bHQgUnVubmVyLlVCVU5UVV9MQVRFU1RcbiAgICovXG4gIHJlYWRvbmx5IHJ1bm5lcj86IGdpdGh1Yi5SdW5uZXI7XG5cbiAgLyoqXG4gICAqIFdpbGwgYXNzdW1lIHRoZSBHaXRIdWJBY3Rpb25Sb2xlIGluIHRoaXMgcmVnaW9uIHdoZW4gcHVibGlzaGluZyBhc3NldHMuXG4gICAqIFRoaXMgaXMgTk9UIHRoZSByZWdpb24gaW4gd2hpY2ggdGhlIGFzc2V0cyBhcmUgcHVibGlzaGVkLlxuICAgKlxuICAgKiBJbiBtb3N0IGNhc2VzLCB5b3UgZG8gbm90IGhhdmUgdG8gd29ycnkgYWJvdXQgdGhpcyBwcm9wZXJ0eSwgYW5kIGNhbiBzYWZlbHlcbiAgICogaWdub3JlIGl0LlxuICAgKlxuICAgKiBAZGVmYXVsdCBcInVzLXdlc3QtMlwiXG4gICAqL1xuICByZWFkb25seSBwdWJsaXNoQXNzZXRzQXV0aFJlZ2lvbj86IHN0cmluZztcblxuICAvKipcbiAgICogSm9iIGxldmVsIHNldHRpbmdzIHRoYXQgd2lsbCBiZSBhcHBsaWVkIHRvIGFsbCBqb2JzIGluIHRoZSB3b3JrZmxvdyxcbiAgICogaW5jbHVkaW5nIHN5bnRoIGFuZCBhc3NldCBkZXBsb3kgam9icy4gQ3VycmVudGx5IHRoZSBvbmx5IHZhbGlkIHNldHRpbmdcbiAgICogaXMgJ2lmJy4gWW91IGNhbiB1c2UgdGhpcyB0byBydW4gam9icyBvbmx5IGluIHNwZWNpZmljIHJlcG9zaXRvcmllcy5cbiAgICpcbiAgICogQHNlZSBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9hY3Rpb25zL3VzaW5nLXdvcmtmbG93cy93b3JrZmxvdy1zeW50YXgtZm9yLWdpdGh1Yi1hY3Rpb25zI2V4YW1wbGUtb25seS1ydW4tam9iLWZvci1zcGVjaWZpYy1yZXBvc2l0b3J5XG4gICAqL1xuICByZWFkb25seSBqb2JTZXR0aW5ncz86IEpvYlNldHRpbmdzO1xufVxuXG4vKipcbiAqIENESyBQaXBlbGluZXMgZm9yIEdpdEh1YiB3b3JrZmxvd3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBHaXRIdWJXb3JrZmxvdyBleHRlbmRzIFBpcGVsaW5lQmFzZSB7XG4gIHB1YmxpYyByZWFkb25seSB3b3JrZmxvd1BhdGg6IHN0cmluZztcbiAgcHVibGljIHJlYWRvbmx5IHdvcmtmbG93TmFtZTogc3RyaW5nO1xuICBwdWJsaWMgcmVhZG9ubHkgd29ya2Zsb3dGaWxlOiBZYW1sRmlsZTtcblxuICBwcml2YXRlIHJlYWRvbmx5IHdvcmtmbG93VHJpZ2dlcnM6IGdpdGh1Yi5Xb3JrZmxvd1RyaWdnZXJzO1xuICBwcml2YXRlIHJlYWRvbmx5IHByZVN5bnRoZWQ6IGJvb2xlYW47XG4gIHByaXZhdGUgcmVhZG9ubHkgYXdzQ3JlZGVudGlhbHM6IEF3c0NyZWRlbnRpYWxzUHJvdmlkZXI7XG4gIHByaXZhdGUgcmVhZG9ubHkgZG9ja2VyQ3JlZGVudGlhbHM6IERvY2tlckNyZWRlbnRpYWxbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBjZGtDbGlWZXJzaW9uPzogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IGJ1aWxkQ29udGFpbmVyPzogZ2l0aHViLkNvbnRhaW5lck9wdGlvbnM7XG4gIHByaXZhdGUgcmVhZG9ubHkgcHJlQnVpbGRTdGVwczogZ2l0aHViLkpvYlN0ZXBbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBwb3N0QnVpbGRTdGVwczogZ2l0aHViLkpvYlN0ZXBbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBqb2JPdXRwdXRzOiBSZWNvcmQ8c3RyaW5nLCBnaXRodWIuSm9iU3RlcE91dHB1dFtdPiA9IHt9O1xuICBwcml2YXRlIHJlYWRvbmx5IGFzc2V0SGFzaE1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBwcml2YXRlIHJlYWRvbmx5IHJ1bm5lcjogZ2l0aHViLlJ1bm5lcjtcbiAgcHJpdmF0ZSByZWFkb25seSBwdWJsaXNoQXNzZXRzQXV0aFJlZ2lvbjogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHN0YWNrUHJvcGVydGllczogUmVjb3JkPFxuICBzdHJpbmcsXG4gIHtcbiAgICBlbnZpcm9ubWVudDogQWRkR2l0SHViU3RhZ2VPcHRpb25zWydnaXRIdWJFbnZpcm9ubWVudCddO1xuICAgIGNhcGFiaWxpdGllczogQWRkR2l0SHViU3RhZ2VPcHRpb25zWydzdGFja0NhcGFiaWxpdGllcyddO1xuICAgIHNldHRpbmdzOiBBZGRHaXRIdWJTdGFnZU9wdGlvbnNbJ2pvYlNldHRpbmdzJ107XG4gIH1cbiAgPiA9IHt9O1xuICBwcml2YXRlIHJlYWRvbmx5IGpvYlNldHRpbmdzPzogSm9iU2V0dGluZ3M7XG4gIC8vIGluIG9yZGVyIHRvIGtlZXAgdHJhY2sgb2YgaWYgdGhpcyBwaXBlbGluZSBoYXMgYmVlbiBidWlsdCBzbyB3ZSBjYW5cbiAgLy8gY2F0Y2ggbGF0ZXIgY2FsbHMgdG8gYWRkV2F2ZSgpIG9yIGFkZFN0YWdlKClcbiAgcHJpdmF0ZSBidWlsdEdIID0gZmFsc2U7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEdpdEh1YldvcmtmbG93UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIHRoaXMuY2RrQ2xpVmVyc2lvbiA9IHByb3BzLmNka0NsaVZlcnNpb247XG4gICAgdGhpcy5wcmVTeW50aGVkID0gcHJvcHMucHJlU3ludGhlZCA/PyBmYWxzZTtcbiAgICB0aGlzLmJ1aWxkQ29udGFpbmVyID0gcHJvcHMuYnVpbGRDb250YWluZXI7XG4gICAgdGhpcy5wcmVCdWlsZFN0ZXBzID0gcHJvcHMucHJlQnVpbGRTdGVwcyA/PyBbXTtcbiAgICB0aGlzLnBvc3RCdWlsZFN0ZXBzID0gcHJvcHMucG9zdEJ1aWxkU3RlcHMgPz8gW107XG4gICAgdGhpcy5qb2JTZXR0aW5ncyA9IHByb3BzLmpvYlNldHRpbmdzO1xuXG4gICAgdGhpcy5hd3NDcmVkZW50aWFscyA9IHRoaXMuZ2V0QXdzQ3JlZGVudGlhbHMocHJvcHMpO1xuXG4gICAgdGhpcy5kb2NrZXJDcmVkZW50aWFscyA9IHByb3BzLmRvY2tlckNyZWRlbnRpYWxzID8/IFtdO1xuXG4gICAgdGhpcy53b3JrZmxvd1BhdGggPSBwcm9wcy53b3JrZmxvd1BhdGggPz8gJy5naXRodWIvd29ya2Zsb3dzL2RlcGxveS55bWwnO1xuICAgIGlmICghdGhpcy53b3JrZmxvd1BhdGguZW5kc1dpdGgoJy55bWwnKSAmJiF0aGlzLndvcmtmbG93UGF0aC5lbmRzV2l0aCgnLnlhbWwnKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCd3b3JrZmxvdyBmaWxlIGlzIGV4cGVjdGVkIHRvIGJlIGEgeWFtbCBmaWxlJyk7XG4gICAgfVxuICAgIGlmICghdGhpcy53b3JrZmxvd1BhdGguaW5jbHVkZXMoJy5naXRodWIvd29ya2Zsb3dzLycpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3dvcmtmbG93IGZpbGVzIG11c3QgYmUgc3RvcmVkIGluIHRoZSBcXCcuZ2l0aHViL3dvcmtmbG93c1xcJyBkaXJlY3Rvcnkgb2YgeW91ciByZXBvc2l0b3J5Jyk7XG4gICAgfVxuXG4gICAgdGhpcy53b3JrZmxvd0ZpbGUgPSBuZXcgWWFtbEZpbGUodGhpcy53b3JrZmxvd1BhdGgpO1xuICAgIHRoaXMud29ya2Zsb3dOYW1lID0gcHJvcHMud29ya2Zsb3dOYW1lID8/ICdkZXBsb3knO1xuICAgIHRoaXMud29ya2Zsb3dUcmlnZ2VycyA9IHByb3BzLndvcmtmbG93VHJpZ2dlcnMgPz8ge1xuICAgICAgcHVzaDogeyBicmFuY2hlczogWydtYWluJ10gfSxcbiAgICAgIHdvcmtmbG93RGlzcGF0Y2g6IHt9LFxuICAgIH07XG5cbiAgICB0aGlzLnJ1bm5lciA9IHByb3BzLnJ1bm5lciA/PyBnaXRodWIuUnVubmVyLlVCVU5UVV9MQVRFU1Q7XG4gICAgdGhpcy5wdWJsaXNoQXNzZXRzQXV0aFJlZ2lvbiA9IHByb3BzLnB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uID8/ICd1cy13ZXN0LTInO1xuICB9XG5cbiAgLyoqXG4gICAqIFBhcnNlIEFXUyBjcmVkZW50aWFsIGNvbmZpZ3VyYXRpb24gZnJvbSBkZXByZWNhdGVkIHByb3BlcnRpZXMgRm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuICAgKi9cbiAgcHJpdmF0ZSBnZXRBd3NDcmVkZW50aWFscyhwcm9wczogR2l0SHViV29ya2Zsb3dQcm9wcykge1xuICAgIGlmIChwcm9wcy5naXRIdWJBY3Rpb25Sb2xlQXJuKSB7XG4gICAgICBpZiAocHJvcHMuYXdzQ3JlZHMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdQbGVhc2UgcHJvdmlkZSBvbmx5IG9uZSBtZXRob2Qgb2YgYXV0aGVudGljYXRpb24gKHJlbW92ZSBnaXRodWJBY3Rpb25Sb2xlQXJuKScpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEF3c0NyZWRlbnRpYWxzLmZyb21PcGVuSWRDb25uZWN0KHtcbiAgICAgICAgZ2l0SHViQWN0aW9uUm9sZUFybjogcHJvcHMuZ2l0SHViQWN0aW9uUm9sZUFybixcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChwcm9wcy5hd3NDcmVkZW50aWFscykge1xuICAgICAgaWYgKHByb3BzLmF3c0NyZWRzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUGxlYXNlIHByb3ZpZGUgb25seSBvbmUgbWV0aG9kIG9mIGF1dGhlbnRpY2F0aW9uIChyZW1vdmUgYXdzQ3JlZGVudGlhbHMpJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gQXdzQ3JlZGVudGlhbHMuZnJvbUdpdEh1YlNlY3JldHMoe1xuICAgICAgICBhY2Nlc3NLZXlJZDogJ0FXU19BQ0NFU1NfS0VZX0lEJyxcbiAgICAgICAgc2VjcmV0QWNjZXNzS2V5OiAnQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZJyxcbiAgICAgICAgLi4ucHJvcHMuYXdzQ3JlZGVudGlhbHMsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvcHMuYXdzQ3JlZHMgPz8gQXdzQ3JlZGVudGlhbHMuZnJvbUdpdEh1YlNlY3JldHMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXBsb3kgYSBzaW5nbGUgU3RhZ2UgYnkgaXRzZWxmIHdpdGggb3B0aW9ucyBmb3IgZnVydGhlciBHaXRIdWIgY29uZmlndXJhdGlvbi5cbiAgICpcbiAgICogQWRkIGEgU3RhZ2UgdG8gdGhlIHBpcGVsaW5lLCB0byBiZSBkZXBsb3llZCBpbiBzZXF1ZW5jZSB3aXRoIG90aGVyIFN0YWdlcyBhZGRlZCB0byB0aGUgcGlwZWxpbmUuXG4gICAqIEFsbCBTdGFja3MgaW4gdGhlIHN0YWdlIHdpbGwgYmUgZGVwbG95ZWQgaW4gYW4gb3JkZXIgYXV0b21hdGljYWxseSBkZXRlcm1pbmVkIGJ5IHRoZWlyIHJlbGF0aXZlIGRlcGVuZGVuY2llcy5cbiAgICovXG4gIHB1YmxpYyBhZGRTdGFnZVdpdGhHaXRIdWJPcHRpb25zKHN0YWdlOiBTdGFnZSwgb3B0aW9ucz86IEFkZEdpdEh1YlN0YWdlT3B0aW9ucyk6IFN0YWdlRGVwbG95bWVudCB7XG4gICAgY29uc3Qgc3RhZ2VEZXBsb3ltZW50ID0gdGhpcy5hZGRTdGFnZShzdGFnZSwgb3B0aW9ucyk7XG5cbiAgICAvLyBrZWVwIHRyYWNrIG9mIEdpdEh1YiBzcGVjaWZpYyBvcHRpb25zXG4gICAgY29uc3Qgc3RhY2tzID0gc3RhZ2VEZXBsb3ltZW50LnN0YWNrcztcbiAgICB0aGlzLmFkZFN0YWNrUHJvcHMoc3RhY2tzLCAnZW52aXJvbm1lbnQnLCBvcHRpb25zPy5naXRIdWJFbnZpcm9ubWVudCk7XG4gICAgdGhpcy5hZGRTdGFja1Byb3BzKHN0YWNrcywgJ2NhcGFiaWxpdGllcycsIG9wdGlvbnM/LnN0YWNrQ2FwYWJpbGl0aWVzKTtcbiAgICB0aGlzLmFkZFN0YWNrUHJvcHMoc3RhY2tzLCAnc2V0dGluZ3MnLCBvcHRpb25zPy5qb2JTZXR0aW5ncyk7XG5cbiAgICByZXR1cm4gc3RhZ2VEZXBsb3ltZW50O1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIFdhdmUgdG8gdGhlIHBpcGVsaW5lLCBmb3IgZGVwbG95aW5nIG11bHRpcGxlIFN0YWdlcyBpbiBwYXJhbGxlbFxuICAgKlxuICAgKiBVc2UgdGhlIHJldHVybiBvYmplY3Qgb2YgdGhpcyBtZXRob2QgdG8gZGVwbG95IG11bHRpcGxlIHN0YWdlcyBpbiBwYXJhbGxlbC5cbiAgICpcbiAgICogRXhhbXBsZTpcbiAgICpcbiAgICogYGBgdHNcbiAgICogZGVjbGFyZSBjb25zdCBwaXBlbGluZTogR2l0SHViV29ya2Zsb3c7IC8vIGFzc2lnbiBwaXBlbGluZSBhIHZhbHVlXG4gICAqXG4gICAqIGNvbnN0IHdhdmUgPSBwaXBlbGluZS5hZGRXYXZlKCdNeVdhdmUnKTtcbiAgICogd2F2ZS5hZGRTdGFnZShuZXcgTXlTdGFnZSh0aGlzLCAnU3RhZ2UxJykpO1xuICAgKiB3YXZlLmFkZFN0YWdlKG5ldyBNeVN0YWdlKHRoaXMsICdTdGFnZTInKSk7XG4gICAqIGBgYFxuICAgKi9cbiAgcHVibGljIGFkZFdhdmUoaWQ6IHN0cmluZywgb3B0aW9ucz86IFdhdmVPcHRpb25zKTogV2F2ZSB7XG4gICAgcmV0dXJuIHRoaXMuYWRkR2l0SHViV2F2ZShpZCwgb3B0aW9ucyk7XG4gIH1cblxuICBwdWJsaWMgYWRkR2l0SHViV2F2ZShpZDogc3RyaW5nLCBvcHRpb25zPzogV2F2ZU9wdGlvbnMpOiBHaXRIdWJXYXZlIHtcbiAgICBpZiAodGhpcy5idWlsdEdIKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiYWRkV2F2ZTogY2FuJ3QgYWRkIFdhdmVzIGFueW1vcmUgYWZ0ZXIgYnVpbGRQaXBlbGluZSgpIGhhcyBiZWVuIGNhbGxlZFwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB3YXZlID0gbmV3IEdpdEh1YldhdmUoaWQsIHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMud2F2ZXMucHVzaCh3YXZlKTtcbiAgICByZXR1cm4gd2F2ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdXBwb3J0IGFkZGluZyBzdGFnZXMgd2l0aCBHaXRIdWIgb3B0aW9ucyB0byB3YXZlcyAtIHNob3VsZCBPTkxZIGJlIGNhbGxlZCBpbnRlcm5hbGx5LlxuICAgKlxuICAgKiBVc2UgYHBpcGVsaW5lLmFkZFdhdmUoKWAgYW5kIGl0J2xsIGNhbGwgdGhpcyB3aGVuIGB3YXZlLmFkZFN0YWdlKClgIGlzIGNhbGxlZC5cbiAgICpcbiAgICogYHBpcGVsaW5lLmFkZFN0YWdlKClgIHdpbGwgYWxzbyBjYWxsIHRoaXMsIHNpbmNlIGl0IGNhbGxzIGBwaXBlbGluZS5hZGRXYXZlKCkuYWRkU3RhZ2UoKWAuXG4gICAqXG4gICAqICBAaW50ZXJuYWxcbiAgICovXG4gIHB1YmxpYyBfYWRkU3RhZ2VGcm9tV2F2ZShcbiAgICBzdGFnZTogU3RhZ2UsXG4gICAgc3RhZ2VEZXBsb3ltZW50OiBTdGFnZURlcGxveW1lbnQsXG4gICAgb3B0aW9ucz86IEFkZEdpdEh1YlN0YWdlT3B0aW9ucyxcbiAgKSB7XG4gICAgaWYgKCEoc3RhZ2UgaW5zdGFuY2VvZiBHaXRIdWJTdGFnZSkgJiYgb3B0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZ2hTdGFnZSA9IHN0YWdlIGluc3RhbmNlb2YgR2l0SHViU3RhZ2UgPyBzdGFnZSA6IHVuZGVmaW5lZDtcblxuICAgIC8vIGtlZXAgdHJhY2sgb2YgR2l0SHViIHNwZWNpZmljIG9wdGlvbnNcbiAgICBjb25zdCBzdGFja3MgPSBzdGFnZURlcGxveW1lbnQuc3RhY2tzO1xuICAgIHRoaXMuYWRkU3RhY2tQcm9wcyhcbiAgICAgIHN0YWNrcyxcbiAgICAgICdlbnZpcm9ubWVudCcsXG4gICAgICBnaFN0YWdlPy5wcm9wcz8uZ2l0SHViRW52aXJvbm1lbnQgPz8gb3B0aW9ucz8uZ2l0SHViRW52aXJvbm1lbnQsXG4gICAgKTtcbiAgICB0aGlzLmFkZFN0YWNrUHJvcHMoXG4gICAgICBzdGFja3MsXG4gICAgICAnY2FwYWJpbGl0aWVzJyxcbiAgICAgIGdoU3RhZ2U/LnByb3BzPy5zdGFja0NhcGFiaWxpdGllcyA/PyBvcHRpb25zPy5zdGFja0NhcGFiaWxpdGllcyxcbiAgICApO1xuICAgIHRoaXMuYWRkU3RhY2tQcm9wcyhcbiAgICAgIHN0YWNrcyxcbiAgICAgICdzZXR0aW5ncycsXG4gICAgICBnaFN0YWdlPy5wcm9wcz8uam9iU2V0dGluZ3MgPz8gb3B0aW9ucz8uam9iU2V0dGluZ3MsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkU3RhY2tQcm9wcyhzdGFja3M6IFN0YWNrRGVwbG95bWVudFtdLCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSkge1xuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7IHJldHVybjsgfVxuICAgIGZvciAoY29uc3Qgc3RhY2sgb2Ygc3RhY2tzKSB7XG4gICAgICB0aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdID0ge1xuICAgICAgICAuLi50aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdLFxuICAgICAgICBba2V5XTogdmFsdWUsXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHByb3RlY3RlZCBkb0J1aWxkUGlwZWxpbmUoKSB7XG4gICAgdGhpcy5idWlsdEdIID0gdHJ1ZTtcbiAgICBjb25zdCBhcHAgPSBTdGFnZS5vZih0aGlzKTtcbiAgICBpZiAoIWFwcCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGUgR2l0SHViIFdvcmtmbG93IG11c3QgYmUgZGVmaW5lZCBpbiB0aGUgc2NvcGUgb2YgYW4gQXBwJyk7XG4gICAgfVxuICAgIGNvbnN0IGNka291dERpciA9IGFwcC5vdXRkaXI7XG5cbiAgICBjb25zdCBqb2JzID0gbmV3IEFycmF5PEpvYj4oKTtcblxuICAgIGNvbnN0IHN0cnVjdHVyZSA9IG5ldyBQaXBlbGluZUdyYXBoKHRoaXMsIHtcbiAgICAgIHNlbGZNdXRhdGlvbjogZmFsc2UsXG4gICAgICBwdWJsaXNoVGVtcGxhdGU6IHRydWUsXG4gICAgICBwcmVwYXJlU3RlcDogZmFsc2UsIC8vIHdlIGNyZWF0ZSBhbmQgZXhlY3V0ZSB0aGUgY2hhbmdlc2V0IGluIGEgc2luZ2xlIGpvYlxuICAgIH0pO1xuXG4gICAgZm9yIChjb25zdCBzdGFnZU5vZGUgb2YgZmxhdHRlbihzdHJ1Y3R1cmUuZ3JhcGguc29ydGVkQ2hpbGRyZW4oKSkpIHtcbiAgICAgIGlmICghaXNHcmFwaChzdGFnZU5vZGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVG9wLWxldmVsIGNoaWxkcmVuIG11c3QgYmUgZ3JhcGhzLCBnb3QgJyR7c3RhZ2VOb2RlfSdgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdHJhbmNoZXMgPSBzdGFnZU5vZGUuc29ydGVkTGVhdmVzKCk7XG5cbiAgICAgIGZvciAoY29uc3QgdHJhbmNoZSBvZiB0cmFuY2hlcykge1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgdHJhbmNoZSkge1xuICAgICAgICAgIGNvbnN0IGpvYiA9IHRoaXMuam9iRm9yTm9kZShub2RlLCB7XG4gICAgICAgICAgICBhc3NlbWJseURpcjogY2Rrb3V0RGlyLFxuICAgICAgICAgICAgc3RydWN0dXJlLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKGpvYikge1xuICAgICAgICAgICAgam9icy5wdXNoKGpvYik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY29udmVydCBqb2JzIHRvIGEgbWFwIGFuZCBtYWtlIHN1cmUgdGhlcmUgYXJlIG5vIGR1cGxpY2F0ZXNcbiAgICBjb25zdCBqb2JtYXA6IFJlY29yZDxzdHJpbmcsIGdpdGh1Yi5Kb2I+ID0ge307XG4gICAgZm9yIChjb25zdCBqb2Igb2Ygam9icykge1xuICAgICAgaWYgKGpvYi5pZCBpbiBqb2JtYXApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBkdXBsaWNhdGUgam9iIGlkICR7am9iLmlkfWApO1xuICAgICAgfVxuICAgICAgam9ibWFwW2pvYi5pZF0gPSBzbmFrZUNhc2VLZXlzKGpvYi5kZWZpbml0aW9uKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgam9icyB3aXRoIGxhdGUtYm91bmQgb3V0cHV0IHJlcXVlc3RzXG4gICAgdGhpcy5pbnNlcnRKb2JPdXRwdXRzKGpvYm1hcCk7XG5cbiAgICBjb25zdCB3b3JrZmxvdyA9IHtcbiAgICAgIG5hbWU6IHRoaXMud29ya2Zsb3dOYW1lLFxuICAgICAgb246IHNuYWtlQ2FzZUtleXModGhpcy53b3JrZmxvd1RyaWdnZXJzLCAnXycpLFxuICAgICAgam9iczogam9ibWFwLFxuICAgIH07XG5cbiAgICAvLyB3cml0ZSBhcyBhIHlhbWwgZmlsZVxuICAgIHRoaXMud29ya2Zsb3dGaWxlLnVwZGF0ZSh3b3JrZmxvdyk7XG5cbiAgICAvLyBjcmVhdGUgZGlyZWN0b3J5IGlmIGl0IGRvZXMgbm90IGV4aXN0XG4gICAgbWtkaXJTeW5jKHBhdGguZGlybmFtZSh0aGlzLndvcmtmbG93UGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG4gICAgLy8gR0lUSFVCX1dPUktGTE9XIGlzIHNldCB3aGVuIEdpdEh1YiBBY3Rpb25zIGlzIHJ1bm5pbmcgdGhlIHdvcmtmbG93LlxuICAgIC8vIHNlZTogaHR0cHM6Ly9kb2NzLmdpdGh1Yi5jb20vZW4vYWN0aW9ucy9sZWFybi1naXRodWItYWN0aW9ucy9lbnZpcm9ubWVudC12YXJpYWJsZXMjZGVmYXVsdC1lbnZpcm9ubWVudC12YXJpYWJsZXNcbiAgICBjb25zdCBjb250ZXh0VmFsdWUgPSB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnY2RrLXBpcGVsaW5lcy1naXRodWI6ZGlmZlByb3RlY3Rpb24nKTtcbiAgICBjb25zdCBkaWZmUHJvdGVjdGlvbiA9IGNvbnRleHRWYWx1ZSA9PT0gJ2ZhbHNlJyA/IGZhbHNlIDogY29udGV4dFZhbHVlID8/IHRydWU7XG4gICAgaWYgKGRpZmZQcm90ZWN0aW9uICYmIHByb2Nlc3MuZW52LkdJVEhVQl9XT1JLRkxPVyA9PT0gdGhpcy53b3JrZmxvd05hbWUpIHtcbiAgICAgIC8vIGNoZWNrIGlmIHdvcmtmbG93IGZpbGUgaGFzIGNoYW5nZWRcbiAgICAgIGlmICghZXhpc3RzU3luYyh0aGlzLndvcmtmbG93UGF0aCkgfHwgdGhpcy53b3JrZmxvd0ZpbGUudG9ZYW1sKCkgIT09IHJlYWRGaWxlU3luYyh0aGlzLndvcmtmbG93UGF0aCwgJ3V0ZjgnKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBsZWFzZSBjb21taXQgdGhlIHVwZGF0ZWQgd29ya2Zsb3cgZmlsZSAke3BhdGgucmVsYXRpdmUoX19kaXJuYW1lLCB0aGlzLndvcmtmbG93UGF0aCl9IHdoZW4geW91IGNoYW5nZSB5b3VyIHBpcGVsaW5lIGRlZmluaXRpb24uYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy53b3JrZmxvd0ZpbGUud3JpdGVGaWxlKCk7XG4gIH1cblxuICBwcml2YXRlIGluc2VydEpvYk91dHB1dHMoam9ibWFwOiBSZWNvcmQ8c3RyaW5nLCBnaXRodWIuSm9iPikge1xuICAgIGZvciAoY29uc3QgW2pvYklkLCBqb2JPdXRwdXRzXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLmpvYk91dHB1dHMpKSB7XG4gICAgICBqb2JtYXBbam9iSWRdID0ge1xuICAgICAgICAuLi5qb2JtYXBbam9iSWRdLFxuICAgICAgICBvdXRwdXRzOiB7XG4gICAgICAgICAgLi4uam9ibWFwW2pvYklkXS5vdXRwdXRzLFxuICAgICAgICAgIC4uLnRoaXMucmVuZGVySm9iT3V0cHV0cyhqb2JPdXRwdXRzKSxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJKb2JPdXRwdXRzKG91dHB1dHM6IGdpdGh1Yi5Kb2JTdGVwT3V0cHV0W10pIHtcbiAgICBjb25zdCByZW5kZXJlZE91dHB1dHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IG91dHB1dCBvZiBvdXRwdXRzKSB7XG4gICAgICByZW5kZXJlZE91dHB1dHNbb3V0cHV0Lm91dHB1dE5hbWVdID0gYFxcJHt7IHN0ZXBzLiR7b3V0cHV0LnN0ZXBJZH0ub3V0cHV0cy4ke291dHB1dC5vdXRwdXROYW1lfSB9fWA7XG4gICAgfVxuICAgIHJldHVybiByZW5kZXJlZE91dHB1dHM7XG4gIH1cblxuICAvKipcbiAgICogTWFrZSBhbiBhY3Rpb24gZnJvbSB0aGUgZ2l2ZW4gbm9kZSBhbmQvb3Igc3RlcFxuICAgKi9cbiAgcHJpdmF0ZSBqb2JGb3JOb2RlKG5vZGU6IEFHcmFwaE5vZGUsIG9wdGlvbnM6IENvbnRleHQpOiBKb2IgfCB1bmRlZmluZWQge1xuICAgIHN3aXRjaCAobm9kZS5kYXRhPy50eXBlKSB7XG4gICAgICAvLyBOb3RoaW5nIGZvciB0aGVzZSwgdGhleSBhcmUgZ3JvdXBpbmdzIChzaG91bGRuJ3QgZXZlbiBoYXZlIHBvcHBlZCB1cCBoZXJlKVxuICAgICAgY2FzZSAnZ3JvdXAnOlxuICAgICAgY2FzZSAnc3RhY2stZ3JvdXAnOlxuICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgam9iRm9yTm9kZTogZGlkIG5vdCBleHBlY3QgdG8gZ2V0IGdyb3VwIG5vZGVzOiAke25vZGUuZGF0YT8udHlwZX1gKTtcblxuICAgICAgY2FzZSAnc2VsZi11cGRhdGUnOlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dpdEh1YiBXb3JrZmxvd3MgZG9lcyBub3Qgc3VwcG9ydCBzZWxmIG11dGF0aW9uJyk7XG5cbiAgICAgIGNhc2UgJ3B1Ymxpc2gtYXNzZXRzJzpcbiAgICAgICAgcmV0dXJuIHRoaXMuam9iRm9yQXNzZXRQdWJsaXNoKG5vZGUsIG5vZGUuZGF0YS5hc3NldHMsIG9wdGlvbnMpO1xuXG4gICAgICBjYXNlICdwcmVwYXJlJzpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdcInByZXBhcmVcIiBpcyBub3Qgc3VwcG9ydGVkIGJ5IEdpdEh1YiBXb3JrZmxvd3MnKTtcblxuICAgICAgY2FzZSAnZXhlY3V0ZSc6XG4gICAgICAgIHJldHVybiB0aGlzLmpvYkZvckRlcGxveShub2RlLCBub2RlLmRhdGEuc3RhY2ssIG5vZGUuZGF0YS5jYXB0dXJlT3V0cHV0cyk7XG5cbiAgICAgIGNhc2UgJ3N0ZXAnOlxuICAgICAgICBpZiAobm9kZS5kYXRhLmlzQnVpbGRTdGVwKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuam9iRm9yQnVpbGRTdGVwKG5vZGUsIG5vZGUuZGF0YS5zdGVwKTtcbiAgICAgICAgfSBlbHNlIGlmIChub2RlLmRhdGEuc3RlcCBpbnN0YW5jZW9mIFNoZWxsU3RlcCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmpvYkZvclNjcmlwdFN0ZXAobm9kZSwgbm9kZS5kYXRhLnN0ZXApO1xuICAgICAgICB9IGVsc2UgaWYgKG5vZGUuZGF0YS5zdGVwIGluc3RhbmNlb2YgR2l0SHViQWN0aW9uU3RlcCkge1xuICAgICAgICAgIHJldHVybiB0aGlzLmpvYkZvckdpdEh1YkFjdGlvblN0ZXAobm9kZSwgbm9kZS5kYXRhLnN0ZXApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgdW5zdXBwb3J0ZWQgc3RlcCB0eXBlOiAke25vZGUuZGF0YS5zdGVwLmNvbnN0cnVjdG9yLm5hbWV9YCk7XG4gICAgICAgIH1cblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgLy8gVGhlICdhcyBhbnknIGlzIHRlbXBvcmFyeSwgdW50aWwgdGhlIGNoYW5nZSB1cHN0cmVhbSByb2xscyBvdXRcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBHaXRIdWJXb3Jma2xvdyBkb2VzIG5vdCBzdXBwb3J0IGdyYXBoIG5vZGVzIG9mIHR5cGUgJyR7KG5vZGUuZGF0YSBhcyBhbnkpPy50eXBlfScuIFlvdSBhcmUgcHJvYmFibHkgdXNpbmcgYSBmZWF0dXJlIHRoaXMgQ0RLIFBpcGVsaW5lcyBpbXBsZW1lbnRhdGlvbiBkb2VzIG5vdCBzdXBwb3J0LmApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgam9iRm9yQXNzZXRQdWJsaXNoKG5vZGU6IEFHcmFwaE5vZGUsIGFzc2V0czogU3RhY2tBc3NldFtdLCBvcHRpb25zOiBDb250ZXh0KTogSm9iIHtcbiAgICBpZiAoYXNzZXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBc3NldCBQdWJsaXNoIHN0ZXAgbXVzdCBoYXZlIGF0IGxlYXN0IDEgYXNzZXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbnN0YWxsU3VmZml4ID0gdGhpcy5jZGtDbGlWZXJzaW9uID8gYEAke3RoaXMuY2RrQ2xpVmVyc2lvbn1gIDogJyc7XG4gICAgY29uc3QgY2Rrb3V0RGlyID0gb3B0aW9ucy5hc3NlbWJseURpcjtcbiAgICBjb25zdCBqb2JJZCA9IGAke05hbWVzLnVuaXF1ZUlkKHRoaXMpfS0ke25vZGUudW5pcXVlSWR9YDtcbiAgICBjb25zdCBhc3NldElkID0gYXNzZXRzWzBdLmFzc2V0SWQ7XG5cbiAgICAvLyBjaGVjayBpZiBhc3NldCBpcyBkb2NrZXIgYXNzZXQgYW5kIGlmIHdlIGhhdmUgZG9ja2VyIGNyZWRlbnRpYWxzXG4gICAgY29uc3QgZG9ja2VyTG9naW5TdGVwczogZ2l0aHViLkpvYlN0ZXBbXSA9IFtdO1xuICAgIGlmIChub2RlLnVuaXF1ZUlkLmluY2x1ZGVzKCdEb2NrZXJBc3NldCcpICYmIHRoaXMuZG9ja2VyQ3JlZGVudGlhbHMubGVuZ3RoID4gMCkge1xuICAgICAgZm9yIChjb25zdCBjcmVkcyBvZiB0aGlzLmRvY2tlckNyZWRlbnRpYWxzKSB7XG4gICAgICAgIGRvY2tlckxvZ2luU3RlcHMucHVzaCguLi50aGlzLnN0ZXBzVG9Db25maWd1cmVEb2NrZXIoY3JlZHMpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjcmVhdGUgb25lIGZpbGUgYW5kIG1ha2Ugb25lIHN0ZXBcbiAgICBjb25zdCByZWxhdGl2ZVRvQXNzZW1ibHkgPSAocDogc3RyaW5nKSA9PiBwYXRoLnBvc2l4LmpvaW4oY2Rrb3V0RGlyLCBwYXRoLnJlbGF0aXZlKHBhdGgucmVzb2x2ZShjZGtvdXREaXIpLCBwKSk7XG4gICAgY29uc3QgZmlsZUNvbnRlbnRzOiBzdHJpbmdbXSA9IFsnc2V0IC1leCddLmNvbmNhdChhc3NldHMubWFwKChhc3NldCkgPT4ge1xuICAgICAgcmV0dXJuIGBucHggY2RrLWFzc2V0cyAtLXBhdGggXCIke3JlbGF0aXZlVG9Bc3NlbWJseShhc3NldC5hc3NldE1hbmlmZXN0UGF0aCl9XCIgLS12ZXJib3NlIHB1Ymxpc2ggXCIke2Fzc2V0LmFzc2V0U2VsZWN0b3J9XCJgO1xuICAgIH0pKTtcblxuICAgIC8vIHdlIG5lZWQgdGhlIGpvYklkIHRvIHJlZmVyZW5jZSB0aGUgb3V0cHV0cyBsYXRlclxuICAgIHRoaXMuYXNzZXRIYXNoTWFwW2Fzc2V0SWRdID0gam9iSWQ7XG4gICAgZmlsZUNvbnRlbnRzLnB1c2goYGVjaG8gJyR7QVNTRVRfSEFTSF9OQU1FfT0ke2Fzc2V0SWR9JyA+PiAkR0lUSFVCX09VVFBVVGApO1xuXG4gICAgY29uc3QgcHVibGlzaFN0ZXBGaWxlID0gcGF0aC5qb2luKGNka291dERpciwgYHB1Ymxpc2gtJHtqb2JJZH0tc3RlcC5zaGApO1xuICAgIG1rZGlyU3luYyhwYXRoLmRpcm5hbWUocHVibGlzaFN0ZXBGaWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgd3JpdGVGaWxlU3luYyhwdWJsaXNoU3RlcEZpbGUsIGZpbGVDb250ZW50cy5qb2luKCdcXG4nKSwgeyBlbmNvZGluZzogJ3V0Zi04JyB9KTtcblxuICAgIGNvbnN0IHB1Ymxpc2hTdGVwOiBnaXRodWIuSm9iU3RlcCA9IHtcbiAgICAgIGlkOiAnUHVibGlzaCcsXG4gICAgICBuYW1lOiBgUHVibGlzaCAke2pvYklkfWAsXG4gICAgICBydW46IGAvYmluL2Jhc2ggLi9jZGsub3V0LyR7cGF0aC5yZWxhdGl2ZShjZGtvdXREaXIsIHB1Ymxpc2hTdGVwRmlsZSl9YCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBqb2JJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogYFB1Ymxpc2ggQXNzZXRzICR7am9iSWR9YCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICBuZWVkczogdGhpcy5yZW5kZXJEZXBlbmRlbmNpZXMobm9kZSksXG4gICAgICAgIHBlcm1pc3Npb25zOiB7XG4gICAgICAgICAgY29udGVudHM6IGdpdGh1Yi5Kb2JQZXJtaXNzaW9uLlJFQUQsXG4gICAgICAgICAgaWRUb2tlbjogdGhpcy5hd3NDcmVkZW50aWFscy5qb2JQZXJtaXNzaW9uKCksXG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnNPbjogdGhpcy5ydW5uZXIucnVuc09uLFxuICAgICAgICBvdXRwdXRzOiB7XG4gICAgICAgICAgW0FTU0VUX0hBU0hfTkFNRV06IGBcXCR7eyBzdGVwcy5QdWJsaXNoLm91dHB1dHMuJHtBU1NFVF9IQVNIX05BTUV9IH19YCxcbiAgICAgICAgfSxcbiAgICAgICAgc3RlcHM6IFtcbiAgICAgICAgICAuLi50aGlzLnN0ZXBzVG9Eb3dubG9hZEFzc2VtYmx5KGNka291dERpciksXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0luc3RhbGwnLFxuICAgICAgICAgICAgcnVuOiBgbnBtIGluc3RhbGwgLS1uby1zYXZlIGNkay1hc3NldHMke2luc3RhbGxTdWZmaXh9YCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC4uLnRoaXMuc3RlcHNUb0NvbmZpZ3VyZUF3cyh0aGlzLnB1Ymxpc2hBc3NldHNBdXRoUmVnaW9uKSxcbiAgICAgICAgICAuLi5kb2NrZXJMb2dpblN0ZXBzLFxuICAgICAgICAgIHB1Ymxpc2hTdGVwLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBqb2JGb3JEZXBsb3kobm9kZTogQUdyYXBoTm9kZSwgc3RhY2s6IFN0YWNrRGVwbG95bWVudCwgX2NhcHR1cmVPdXRwdXRzOiBib29sZWFuKTogSm9iIHtcbiAgICBjb25zdCByZWdpb24gPSBzdGFjay5yZWdpb247XG4gICAgY29uc3QgYWNjb3VudCA9IHN0YWNrLmFjY291bnQ7XG4gICAgaWYgKCFyZWdpb24gfHwgIWFjY291bnQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignXCJhY2NvdW50XCIgYW5kIFwicmVnaW9uXCIgYXJlIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgaWYgKCFzdGFjay50ZW1wbGF0ZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGB1bmFibGUgdG8gZGV0ZXJtaW5lIHRlbXBsYXRlIFVSTCBmb3Igc3RhY2sgJHtzdGFjay5zdGFja0FydGlmYWN0SWR9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZSA9IChzOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgcmV0dXJuIEVudmlyb25tZW50UGxhY2Vob2xkZXJzLnJlcGxhY2Uocywge1xuICAgICAgICBhY2NvdW50SWQ6IGFjY291bnQsXG4gICAgICAgIHJlZ2lvbjogcmVnaW9uLFxuICAgICAgICBwYXJ0aXRpb246ICdhd3MnLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHJlcGxhY2VBc3NldEhhc2ggPSAodGVtcGxhdGU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgaGFzaCA9IHBhdGgucGFyc2UodGVtcGxhdGUuc3BsaXQoJy8nKS5wb3AoKSA/PyAnJykubmFtZTtcbiAgICAgIGlmICh0aGlzLmFzc2V0SGFzaE1hcFtoYXNoXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVGVtcGxhdGUgYXNzZXQgaGFzaCAke2hhc2h9IG5vdCBmb3VuZC5gKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0ZW1wbGF0ZS5yZXBsYWNlKGhhc2gsIGBcXCR7eyBuZWVkcy4ke3RoaXMuYXNzZXRIYXNoTWFwW2hhc2hdfS5vdXRwdXRzLiR7QVNTRVRfSEFTSF9OQU1FfSB9fWApO1xuICAgIH07XG5cbiAgICBjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgICAnbmFtZSc6IHN0YWNrLnN0YWNrTmFtZSxcbiAgICAgICd0ZW1wbGF0ZSc6IHJlcGxhY2VBc3NldEhhc2gocmVzb2x2ZShzdGFjay50ZW1wbGF0ZVVybCkpLFxuICAgICAgJ25vLWZhaWwtb24tZW1wdHktY2hhbmdlc2V0JzogJzEnLFxuICAgIH07XG5cbiAgICBjb25zdCBjYXBhYmlsaXRpZXMgPSB0aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5jYXBhYmlsaXRpZXM7XG4gICAgaWYgKGNhcGFiaWxpdGllcykge1xuICAgICAgcGFyYW1zLmNhcGFiaWxpdGllcyA9IEFycmF5KGNhcGFiaWxpdGllcykuam9pbignLCcpO1xuICAgIH1cblxuICAgIGlmIChzdGFjay5leGVjdXRpb25Sb2xlQXJuKSB7XG4gICAgICBwYXJhbXNbJ3JvbGUtYXJuJ10gPSByZXNvbHZlKHN0YWNrLmV4ZWN1dGlvblJvbGVBcm4pO1xuICAgIH1cbiAgICBjb25zdCBhc3N1bWVSb2xlQXJuID0gc3RhY2suYXNzdW1lUm9sZUFybiA/IHJlc29sdmUoc3RhY2suYXNzdW1lUm9sZUFybikgOiB1bmRlZmluZWQ7XG5cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG5vZGUudW5pcXVlSWQsXG4gICAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIG5hbWU6IGBEZXBsb3kgJHtzdGFjay5zdGFja0FydGlmYWN0SWR9YCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICAuLi50aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5zZXR0aW5ncyxcbiAgICAgICAgcGVybWlzc2lvbnM6IHtcbiAgICAgICAgICBjb250ZW50czogZ2l0aHViLkpvYlBlcm1pc3Npb24uUkVBRCxcbiAgICAgICAgICBpZFRva2VuOiB0aGlzLmF3c0NyZWRlbnRpYWxzLmpvYlBlcm1pc3Npb24oKSxcbiAgICAgICAgfSxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJHaXRIdWJFbnZpcm9ubWVudCh0aGlzLnN0YWNrUHJvcGVydGllc1tzdGFjay5zdGFja0FydGlmYWN0SWRdPy5lbnZpcm9ubWVudCksXG4gICAgICAgIG5lZWRzOiB0aGlzLnJlbmRlckRlcGVuZGVuY2llcyhub2RlKSxcbiAgICAgICAgcnVuc09uOiB0aGlzLnJ1bm5lci5ydW5zT24sXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4udGhpcy5zdGVwc1RvQ29uZmlndXJlQXdzKHJlZ2lvbiwgYXNzdW1lUm9sZUFybiksXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdEZXBsb3knLFxuICAgICAgICAgICAgdXNlczogJ2F3cy1hY3Rpb25zL2F3cy1jbG91ZGZvcm1hdGlvbi1naXRodWItZGVwbG95QHYxLjIuMCcsXG4gICAgICAgICAgICB3aXRoOiBwYXJhbXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgam9iRm9yQnVpbGRTdGVwKG5vZGU6IEFHcmFwaE5vZGUsIHN0ZXA6IFN0ZXApOiBKb2Ige1xuICAgIGlmICghKHN0ZXAgaW5zdGFuY2VvZiBTaGVsbFN0ZXApKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N5bnRoU3RlcCBtdXN0IGJlIGEgU2NyaXB0U3RlcCcpO1xuICAgIH1cblxuICAgIGlmIChzdGVwLmlucHV0cy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N5bnRoU3RlcCBjYW5ub3QgaGF2ZSBpbnB1dHMnKTtcbiAgICB9XG5cbiAgICBpZiAoc3RlcC5vdXRwdXRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3ludGhTdGVwIG11c3QgaGF2ZSBhIHNpbmdsZSBvdXRwdXQnKTtcbiAgICB9XG5cbiAgICBpZiAoIXN0ZXAucHJpbWFyeU91dHB1dCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzeW50aFN0ZXAgcmVxdWlyZXMgYSBwcmltYXJ5T3V0cHV0IHdoaWNoIGNvbnRhaW5zIGNkay5vdXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBjZGtPdXQgPSBzdGVwLm91dHB1dHNbMF07XG5cbiAgICBjb25zdCBpbnN0YWxsU3RlcHMgPSBzdGVwLmluc3RhbGxDb21tYW5kcy5sZW5ndGggPiAwID8gW3tcbiAgICAgIG5hbWU6ICdJbnN0YWxsJyxcbiAgICAgIHJ1bjogc3RlcC5pbnN0YWxsQ29tbWFuZHMuam9pbignXFxuJyksXG4gICAgfV0gOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZDogbm9kZS51bmlxdWVJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogJ1N5bnRoZXNpemUnLFxuICAgICAgICAuLi50aGlzLnJlbmRlckpvYlNldHRpbmdQYXJhbWV0ZXJzKCksXG4gICAgICAgIHBlcm1pc3Npb25zOiB7XG4gICAgICAgICAgY29udGVudHM6IGdpdGh1Yi5Kb2JQZXJtaXNzaW9uLlJFQUQsXG4gICAgICAgICAgLy8gVGhlIFN5bnRoZXNpemUgam9iIGRvZXMgbm90IHVzZSB0aGUgR2l0SHViIEFjdGlvbiBSb2xlIG9uIGl0cyBvd24sIGJ1dCBpdCdzIHBvc3NpYmxlXG4gICAgICAgICAgLy8gdGhhdCBpdCBpcyBiZWluZyB1c2VkIGluIHRoZSBwcmVCdWlsZFN0ZXBzLlxuICAgICAgICAgIGlkVG9rZW46IHRoaXMuYXdzQ3JlZGVudGlhbHMuam9iUGVybWlzc2lvbigpLFxuICAgICAgICB9LFxuICAgICAgICBydW5zT246IHRoaXMucnVubmVyLnJ1bnNPbixcbiAgICAgICAgbmVlZHM6IHRoaXMucmVuZGVyRGVwZW5kZW5jaWVzKG5vZGUpLFxuICAgICAgICBlbnY6IHN0ZXAuZW52LFxuICAgICAgICBjb250YWluZXI6IHRoaXMuYnVpbGRDb250YWluZXIsXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4udGhpcy5zdGVwc1RvQ2hlY2tvdXQoKSxcbiAgICAgICAgICAuLi50aGlzLnByZUJ1aWxkU3RlcHMsXG4gICAgICAgICAgLi4uaW5zdGFsbFN0ZXBzLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIG5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgICBydW46IHN0ZXAuY29tbWFuZHMuam9pbignXFxuJyksXG4gICAgICAgICAgfSxcbiAgICAgICAgICAuLi50aGlzLnBvc3RCdWlsZFN0ZXBzLFxuICAgICAgICAgIC4uLnRoaXMuc3RlcHNUb1VwbG9hZEFzc2VtYmx5KGNka091dC5kaXJlY3RvcnkpLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNlYXJjaGVzIGZvciB0aGUgc3RhY2sgdGhhdCBwcm9kdWNlZCB0aGUgb3V0cHV0IHZpYSB0aGUgY3VycmVudFxuICAgKiBqb2IncyBkZXBlbmRlbmNpZXMuXG4gICAqXG4gICAqIFRoaXMgZnVuY3Rpb24gc2hvdWxkIGFsd2F5cyBmaW5kIGEgc3RhY2ssIHNpbmNlIGl0IGlzIGd1YXJhbnRlZWRcbiAgICogdGhhdCBhIENmbk91dHB1dCBjb21lcyBmcm9tIGEgcmVmZXJlbmNlZCBzdGFjay5cbiAgICovXG4gIHByaXZhdGUgZmluZFN0YWNrT2ZPdXRwdXQocmVmOiBTdGFja091dHB1dFJlZmVyZW5jZSwgbm9kZTogQUdyYXBoTm9kZSkge1xuICAgIGZvciAoY29uc3QgZGVwIG9mIG5vZGUuYWxsRGVwcykge1xuICAgICAgaWYgKGRlcC5kYXRhPy50eXBlID09PSAnZXhlY3V0ZScgJiYgcmVmLmlzUHJvZHVjZWRCeShkZXAuZGF0YS5zdGFjaykpIHtcbiAgICAgICAgcmV0dXJuIGRlcC51bmlxdWVJZDtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gU2hvdWxkIG5ldmVyIGhhcHBlblxuICAgIHRocm93IG5ldyBFcnJvcihgVGhlIG91dHB1dCAke3JlZi5vdXRwdXROYW1lfSBpcyBub3QgcmVmZXJlbmNlZCBieSBhbnkgb2YgdGhlIGRlcGVuZGVudCBzdGFja3MhYCk7XG4gIH1cblxuICBwcml2YXRlIGFkZEpvYk91dHB1dChqb2JJZDogc3RyaW5nLCBvdXRwdXQ6IGdpdGh1Yi5Kb2JTdGVwT3V0cHV0KSB7XG4gICAgaWYgKHRoaXMuam9iT3V0cHV0c1tqb2JJZF0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5qb2JPdXRwdXRzW2pvYklkXSA9IFtvdXRwdXRdO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmpvYk91dHB1dHNbam9iSWRdLnB1c2gob3V0cHV0KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGpvYkZvclNjcmlwdFN0ZXAobm9kZTogQUdyYXBoTm9kZSwgc3RlcDogU2hlbGxTdGVwKTogSm9iIHtcbiAgICBjb25zdCBlbnZWYXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtlbnZOYW1lLCByZWZdIG9mIE9iamVjdC5lbnRyaWVzKHN0ZXAuZW52RnJvbUNmbk91dHB1dHMpKSB7XG4gICAgICBjb25zdCBqb2JJZCA9IHRoaXMuZmluZFN0YWNrT2ZPdXRwdXQocmVmLCBub2RlKTtcbiAgICAgIHRoaXMuYWRkSm9iT3V0cHV0KGpvYklkLCB7XG4gICAgICAgIG91dHB1dE5hbWU6IHJlZi5vdXRwdXROYW1lLFxuICAgICAgICBzdGVwSWQ6ICdEZXBsb3knLFxuICAgICAgfSk7XG4gICAgICBlbnZWYXJpYWJsZXNbZW52TmFtZV0gPSBgXFwke3sgbmVlZHMuJHtqb2JJZH0ub3V0cHV0cy4ke3JlZi5vdXRwdXROYW1lfSB9fWA7XG4gICAgfVxuXG4gICAgY29uc3QgZG93bmxvYWRJbnB1dHMgPSBuZXcgQXJyYXk8Z2l0aHViLkpvYlN0ZXA+KCk7XG4gICAgY29uc3QgdXBsb2FkT3V0cHV0cyA9IG5ldyBBcnJheTxnaXRodWIuSm9iU3RlcD4oKTtcblxuICAgIGZvciAoY29uc3QgaW5wdXQgb2Ygc3RlcC5pbnB1dHMpIHtcbiAgICAgIGRvd25sb2FkSW5wdXRzLnB1c2goe1xuICAgICAgICB1c2VzOiAnYWN0aW9ucy9kb3dubG9hZC1hcnRpZmFjdEB2MycsXG4gICAgICAgIHdpdGg6IHtcbiAgICAgICAgICBuYW1lOiBpbnB1dC5maWxlU2V0LmlkLFxuICAgICAgICAgIHBhdGg6IGlucHV0LmRpcmVjdG9yeSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZvciAoY29uc3Qgb3V0cHV0IG9mIHN0ZXAub3V0cHV0cykge1xuICAgICAgdXBsb2FkT3V0cHV0cy5wdXNoKHtcbiAgICAgICAgdXNlczogJ2FjdGlvbnMvdXBsb2FkLWFydGlmYWN0QHYzJyxcbiAgICAgICAgd2l0aDoge1xuICAgICAgICAgIG5hbWU6IG91dHB1dC5maWxlU2V0LmlkLFxuICAgICAgICAgIHBhdGg6IG91dHB1dC5kaXJlY3RvcnksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbnN0YWxsU3RlcHMgPSBzdGVwLmluc3RhbGxDb21tYW5kcy5sZW5ndGggPiAwID8gW3tcbiAgICAgIG5hbWU6ICdJbnN0YWxsJyxcbiAgICAgIHJ1bjogc3RlcC5pbnN0YWxsQ29tbWFuZHMuam9pbignXFxuJyksXG4gICAgfV0gOiBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZDogbm9kZS51bmlxdWVJZCxcbiAgICAgIGRlZmluaXRpb246IHtcbiAgICAgICAgbmFtZTogc3RlcC5pZCxcbiAgICAgICAgLi4udGhpcy5yZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpLFxuICAgICAgICBwZXJtaXNzaW9uczoge1xuICAgICAgICAgIGNvbnRlbnRzOiBnaXRodWIuSm9iUGVybWlzc2lvbi5SRUFELFxuICAgICAgICB9LFxuICAgICAgICBydW5zT246IHRoaXMucnVubmVyLnJ1bnNPbixcbiAgICAgICAgbmVlZHM6IHRoaXMucmVuZGVyRGVwZW5kZW5jaWVzKG5vZGUpLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICAuLi5zdGVwLmVudixcbiAgICAgICAgICAuLi5lbnZWYXJpYWJsZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHN0ZXBzOiBbXG4gICAgICAgICAgLi4uZG93bmxvYWRJbnB1dHMsXG4gICAgICAgICAgLi4uaW5zdGFsbFN0ZXBzLFxuICAgICAgICAgIHsgcnVuOiBzdGVwLmNvbW1hbmRzLmpvaW4oJ1xcbicpIH0sXG4gICAgICAgICAgLi4udXBsb2FkT3V0cHV0cyxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgam9iRm9yR2l0SHViQWN0aW9uU3RlcChub2RlOiBBR3JhcGhOb2RlLCBzdGVwOiBHaXRIdWJBY3Rpb25TdGVwKTogSm9iIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IG5vZGUudW5pcXVlSWQsXG4gICAgICBkZWZpbml0aW9uOiB7XG4gICAgICAgIG5hbWU6IHN0ZXAuaWQsXG4gICAgICAgIC4uLnRoaXMucmVuZGVySm9iU2V0dGluZ1BhcmFtZXRlcnMoKSxcbiAgICAgICAgcGVybWlzc2lvbnM6IHtcbiAgICAgICAgICBjb250ZW50czogZ2l0aHViLkpvYlBlcm1pc3Npb24uV1JJVEUsXG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnNPbjogdGhpcy5ydW5uZXIucnVuc09uLFxuICAgICAgICBuZWVkczogdGhpcy5yZW5kZXJEZXBlbmRlbmNpZXMobm9kZSksXG4gICAgICAgIGVudjogc3RlcC5lbnYsXG4gICAgICAgIHN0ZXBzOiBzdGVwLmpvYlN0ZXBzLFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBzdGVwc1RvQ29uZmlndXJlQXdzKHJlZ2lvbjogc3RyaW5nLCBhc3N1bWVSb2xlQXJuPzogc3RyaW5nKTogZ2l0aHViLkpvYlN0ZXBbXSB7XG4gICAgcmV0dXJuIHRoaXMuYXdzQ3JlZGVudGlhbHMuY3JlZGVudGlhbFN0ZXBzKHJlZ2lvbiwgYXNzdW1lUm9sZUFybik7XG4gIH1cblxuICBwcml2YXRlIHN0ZXBzVG9Db25maWd1cmVEb2NrZXIoZG9ja2VyQ3JlZGVudGlhbDogRG9ja2VyQ3JlZGVudGlhbCk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIGxldCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT47XG5cbiAgICBpZiAoZG9ja2VyQ3JlZGVudGlhbC5uYW1lID09PSAnZG9ja2VyJykge1xuICAgICAgcGFyYW1zID0ge1xuICAgICAgICB1c2VybmFtZTogYFxcJHt7IHNlY3JldHMuJHtkb2NrZXJDcmVkZW50aWFsLnVzZXJuYW1lS2V5fSB9fWAsXG4gICAgICAgIHBhc3N3b3JkOiBgXFwke3sgc2VjcmV0cy4ke2RvY2tlckNyZWRlbnRpYWwucGFzc3dvcmRLZXl9IH19YCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChkb2NrZXJDcmVkZW50aWFsLm5hbWUgPT09ICdlY3InKSB7XG4gICAgICBwYXJhbXMgPSB7XG4gICAgICAgIHJlZ2lzdHJ5OiBkb2NrZXJDcmVkZW50aWFsLnJlZ2lzdHJ5LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGFyYW1zID0ge1xuICAgICAgICByZWdpc3RyeTogZG9ja2VyQ3JlZGVudGlhbC5yZWdpc3RyeSxcbiAgICAgICAgdXNlcm5hbWU6IGBcXCR7eyBzZWNyZXRzLiR7ZG9ja2VyQ3JlZGVudGlhbC51c2VybmFtZUtleX0gfX1gLFxuICAgICAgICBwYXNzd29yZDogYFxcJHt7IHNlY3JldHMuJHtkb2NrZXJDcmVkZW50aWFsLnBhc3N3b3JkS2V5fSB9fWAsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIHVzZXM6ICdkb2NrZXIvbG9naW4tYWN0aW9uQHYyJyxcbiAgICAgICAgd2l0aDogcGFyYW1zLFxuICAgICAgfSxcbiAgICBdO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGVwc1RvRG93bmxvYWRBc3NlbWJseSh0YXJnZXREaXI6IHN0cmluZyk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIGlmICh0aGlzLnByZVN5bnRoZWQpIHtcbiAgICAgIHJldHVybiB0aGlzLnN0ZXBzVG9DaGVja291dCgpO1xuICAgIH1cblxuICAgIHJldHVybiBbe1xuICAgICAgbmFtZTogYERvd25sb2FkICR7Q0RLT1VUX0FSVElGQUNUfWAsXG4gICAgICB1c2VzOiAnYWN0aW9ucy9kb3dubG9hZC1hcnRpZmFjdEB2MycsXG4gICAgICB3aXRoOiB7XG4gICAgICAgIG5hbWU6IENES09VVF9BUlRJRkFDVCxcbiAgICAgICAgcGF0aDogdGFyZ2V0RGlyLFxuICAgICAgfSxcbiAgICB9XTtcbiAgfVxuXG4gIHByaXZhdGUgc3RlcHNUb0NoZWNrb3V0KCk6IGdpdGh1Yi5Kb2JTdGVwW10ge1xuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdDaGVja291dCcsXG4gICAgICAgIHVzZXM6ICdhY3Rpb25zL2NoZWNrb3V0QHYzJyxcbiAgICAgIH0sXG4gICAgXTtcbiAgfVxuXG4gIHByaXZhdGUgc3RlcHNUb1VwbG9hZEFzc2VtYmx5KGRpcjogc3RyaW5nKTogZ2l0aHViLkpvYlN0ZXBbXSB7XG4gICAgaWYgKHRoaXMucHJlU3ludGhlZCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHJldHVybiBbe1xuICAgICAgbmFtZTogYFVwbG9hZCAke0NES09VVF9BUlRJRkFDVH1gLFxuICAgICAgdXNlczogJ2FjdGlvbnMvdXBsb2FkLWFydGlmYWN0QHYzJyxcbiAgICAgIHdpdGg6IHtcbiAgICAgICAgbmFtZTogQ0RLT1VUX0FSVElGQUNULFxuICAgICAgICBwYXRoOiBkaXIsXG4gICAgICB9LFxuICAgIH1dO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJEZXBlbmRlbmNpZXMobm9kZTogQUdyYXBoTm9kZSkge1xuICAgIGNvbnN0IGRlcHMgPSBuZXcgQXJyYXk8QUdyYXBoTm9kZT4oKTtcblxuICAgIGZvciAoY29uc3QgZCBvZiBub2RlLmFsbERlcHMpIHtcbiAgICAgIGlmIChkIGluc3RhbmNlb2YgR3JhcGgpIHtcbiAgICAgICAgZGVwcy5wdXNoKC4uLmQuYWxsTGVhdmVzKCkubm9kZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVwcy5wdXNoKGQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkZXBzLm1hcCh4ID0+IHgudW5pcXVlSWQpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJKb2JTZXR0aW5nUGFyYW1ldGVycygpIHtcbiAgICByZXR1cm4gdGhpcy5qb2JTZXR0aW5ncztcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyR2l0SHViRW52aXJvbm1lbnQoZW52aXJvbm1lbnQ/OiBHaXRIdWJFbnZpcm9ubWVudCkge1xuICAgIGlmICghZW52aXJvbm1lbnQpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG4gICAgaWYgKGVudmlyb25tZW50LnVybCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4geyBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQubmFtZSB9O1xuICAgIH1cbiAgICByZXR1cm4geyBlbnZpcm9ubWVudCB9O1xuICB9XG59XG5cbmludGVyZmFjZSBDb250ZXh0IHtcbiAgLyoqXG4gICAqIFRoZSBwaXBlbGluZSBncmFwaC5cbiAgICovXG4gIHJlYWRvbmx5IHN0cnVjdHVyZTogUGlwZWxpbmVHcmFwaDtcblxuICAvKipcbiAgICogTmFtZSBvZiBjbG91ZCBhc3NlbWJseSBkaXJlY3RvcnkuXG4gICAqL1xuICByZWFkb25seSBhc3NlbWJseURpcjogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSm9iIHtcbiAgcmVhZG9ubHkgaWQ6IHN0cmluZztcbiAgcmVhZG9ubHkgZGVmaW5pdGlvbjogZ2l0aHViLkpvYjtcbn1cblxuZnVuY3Rpb24gc25ha2VDYXNlS2V5czxUID0gdW5rbm93bj4ob2JqOiBULCBzZXAgPSAnLScpOiBUIHtcbiAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PSBudWxsKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcbiAgICByZXR1cm4gb2JqLm1hcChvID0+IHNuYWtlQ2FzZUtleXMobywgc2VwKSkgYXMgYW55O1xuICB9XG5cbiAgY29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuICBmb3IgKGxldCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgIC8vIHdlIGRvbid0IHdhbnQgdG8gc25ha2UgY2FzZSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBpZiAoayAhPT0gJ2VudicgJiYgdHlwZW9mIHYgPT09ICdvYmplY3QnICYmIHYgIT0gbnVsbCkge1xuICAgICAgdiA9IHNuYWtlQ2FzZUtleXModik7XG4gICAgfVxuICAgIHJlc3VsdFtkZWNhbWVsaXplKGssIHsgc2VwYXJhdG9yOiBzZXAgfSldID0gdjtcbiAgfVxuICByZXR1cm4gcmVzdWx0IGFzIGFueTtcbn1cblxuLyoqXG4gKiBOYW1lcyBvZiBzZWNyZXRzIGZvciBBV1MgY3JlZGVudGlhbHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXdzQ3JlZGVudGlhbHNTZWNyZXRzIHtcbiAgLyoqXG4gICAqIEBkZWZhdWx0IFwiQVdTX0FDQ0VTU19LRVlfSURcIlxuICAgKi9cbiAgcmVhZG9ubHkgYWNjZXNzS2V5SWQ/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBkZWZhdWx0IFwiQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZXCJcbiAgICovXG4gIHJlYWRvbmx5IHNlY3JldEFjY2Vzc0tleT86IHN0cmluZztcblxuICAvKipcbiAgICogQGRlZmF1bHQgLSBubyBzZXNzaW9uIHRva2VuIGlzIHVzZWRcbiAgICovXG4gIHJlYWRvbmx5IHNlc3Npb25Ub2tlbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uKiBmbGF0dGVuPEE+KHhzOiBJdGVyYWJsZTxBW10+KTogSXRlcmFibGVJdGVyYXRvcjxBPiB7XG4gIGZvciAoY29uc3QgeCBvZiB4cykge1xuICAgIGZvciAoY29uc3QgeSBvZiB4KSB7XG4gICAgICB5aWVsZCB5O1xuICAgIH1cbiAgfVxufVxuIl19