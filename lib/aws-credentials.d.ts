import * as github from './workflows-model';
/**
 * AWS credential provider
 */
export declare abstract class AwsCredentialsProvider {
    abstract jobPermission(): github.JobPermission;
    abstract credentialSteps(region: string, assumeRoleArn?: string): github.JobStep[];
}
/**
 * Locations of GitHub Secrets used to authenticate to AWS
 */
export interface GitHubSecretsProviderProps {
    /**
     * @default "AWS_ACCESS_KEY_ID"
     */
    readonly accessKeyId: string;
    /**
     * @default "AWS_SECRET_ACCESS_KEY"
     */
    readonly secretAccessKey: string;
    /**
     * @default - no session token is used
     */
    readonly sessionToken?: string;
}
/**
 * Role to assume using OpenId Connect
 */
export interface OpenIdConnectProviderProps {
    /**
     * A role that utilizes the GitHub OIDC Identity Provider in your AWS account.
     *
     * You can create your own role in the console with the necessary trust policy
     * to allow gitHub actions from your gitHub repository to assume the role, or
     * you can utilize the `GitHubActionRole` construct to create a role for you.
     */
    readonly gitHubActionRoleArn: string;
    /**
     * The role session name to use when assuming the role.
     *
     * @default - no role session name
     */
    readonly roleSessionName?: string;
}
/**
 * Provides AWS credenitals to the pipeline jobs
 */
export declare class AwsCredentials {
    /**
     * Reference credential secrets to authenticate with AWS. This method assumes
     * that your credentials will be stored as long-lived GitHub Secrets.
     */
    static fromGitHubSecrets(props?: GitHubSecretsProviderProps): AwsCredentialsProvider;
    /**
     * Provide AWS credentials using OpenID Connect.
     */
    static fromOpenIdConnect(props: OpenIdConnectProviderProps): AwsCredentialsProvider;
    /**
     * Don't provide any AWS credentials, use this if runners have preconfigured credentials.
     */
    static runnerHasPreconfiguredCreds(): AwsCredentialsProvider;
}
