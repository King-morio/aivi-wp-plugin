variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "AiVI"
}

variable "tags" {
  description = "Common tags to apply to resources"
  type        = map(string)
  default = {
    ManagedBy = "terraform"
  }
}
