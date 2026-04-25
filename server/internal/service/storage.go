package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/jobo/artifact/server/internal/config"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type StorageService struct {
	client *minio.Client
	bucket string
}

func NewStorageService(cfg config.S3Config) (*StorageService, error) {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	svc := &StorageService{
		client: client,
		bucket: cfg.Bucket,
	}

	return svc, nil
}

func (s *StorageService) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}
	if !exists {
		if err := s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
	}
	return nil
}

func (s *StorageService) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) error {
	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}
	if contentType == "" {
		opts.ContentType = "application/octet-stream"
	}

	_, err := s.client.PutObject(ctx, s.bucket, key, reader, size, opts)
	if err != nil {
		return fmt.Errorf("upload object %s: %w", key, err)
	}
	return nil
}

func (s *StorageService) UploadFromBytes(ctx context.Context, key string, data []byte) error {
	return s.Upload(ctx, key, bytes.NewReader(data), int64(len(data)), "")
}

func (s *StorageService) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("download object %s: %w", key, err)
	}
	return obj, nil
}

func (s *StorageService) Delete(ctx context.Context, key string) error {
	err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("delete object %s: %w", key, err)
	}
	return nil
}

func (s *StorageService) Exists(ctx context.Context, key string) (bool, error) {
	_, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		resp, ok := err.(minio.ErrorResponse)
		if ok && resp.StatusCode == http.StatusNotFound {
			return false, nil
		}
		return false, fmt.Errorf("stat object %s: %w", key, err)
	}
	return true, nil
}

func (s *StorageService) ContentKey(hash string) string {
	if len(hash) < 2 {
		return hash
	}
	return hash[:2] + "/" + hash
}

func (s *StorageService) Bucket() string {
	return s.bucket
}
