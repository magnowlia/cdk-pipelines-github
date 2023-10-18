import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { GitHubCommonProps } from './github-common';
export interface GitHubStageProps extends StageProps, GitHubCommonProps {
}
export declare class GitHubStage extends Stage {
    readonly props?: GitHubStageProps | undefined;
    constructor(scope: Construct, id: string, props?: GitHubStageProps | undefined);
}
