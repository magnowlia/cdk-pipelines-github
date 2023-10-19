import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
/**
 * Properties for the GitHubActionRole construct.
 */
export interface GitHubActionRoleProps {
    /**
     * A list of GitHub repositories you want to be able to access the IAM role.
     * Each entry should be your GitHub username and repository passed in as a
     * single string.
     *
     * For example, `['owner/repo1', 'owner/repo2'].
     */
    readonly repos: string[];
    /**
     * The name of the Oidc role.
     *
     * @default 'GitHubActionRole'
     */
    readonly roleName?: string;
    /**
     * The GitHub OpenId Connect Provider. Must have provider url
     * `https://token.actions.githubusercontent.com`. The audience must be
     * `sts:amazonaws.com`.
     *
     * Only one such provider can be defined per account, so if you already
     * have a provider with the same url, a new provider cannot be created for you.
     *
     * @default - a provider is created for you.
     */
    readonly provider?: iam.IOpenIdConnectProvider;
    /**
     * Thumbprints of GitHub's certificates
     *
     * Every time GitHub rotates their certificates, this value will need to be updated.
     *
     * Default value is up-to-date to June 27, 2023 as per
     * https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/
     *
     * @default - Use built-in keys
     */
    readonly thumbprints?: string[];
}
/**
 * Creates or references a GitHub OIDC provider and accompanying role that trusts the provider.
 * This role can be used to authenticate against AWS instead of using long-lived AWS user credentials
 * stored in GitHub secrets.
 *
 * You can do this manually in the console, or create a separate stack that uses this construct.
 * You must `cdk deploy` once (with your normal AWS credentials) to have this role created for you.
 *
 * You can then make note of the role arn in the stack output and send it into the Github Workflow app via
 * the `gitHubActionRoleArn` property. The role arn will be `arn:aws:iam::<accountId>:role/GithubActionRole`.
 *
 * @see https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
 */
export declare class GitHubActionRole extends Construct {
    /**
     * Reference an existing GitHub Actions provider.
     * You do not need to pass in an arn because the arn for such
     * a provider is always the same.
     */
    static existingGitHubActionsProvider(scope: Construct): iam.IOpenIdConnectProvider;
    /**
     * The role that gets created.
     *
     * You should use the arn of this role as input to the `gitHubActionRoleArn`
     * property in your GitHub Workflow app.
     */
    readonly role: iam.IRole;
    constructor(scope: Construct, id: string, props: GitHubActionRoleProps);
}
