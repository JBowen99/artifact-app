package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type GitService struct {
	repoBasePath string
}

func NewGitService(repoBasePath string) *GitService {
	return &GitService{repoBasePath: repoBasePath}
}

func (g *GitService) InitBareRepo(projectID string) (string, error) {
	repoPath := filepath.Join(g.repoBasePath, projectID)

	if _, err := os.Stat(repoPath); err == nil {
		return "", fmt.Errorf("repository already exists at %s", repoPath)
	}

	if err := os.MkdirAll(repoPath, 0755); err != nil {
		return "", fmt.Errorf("create repo directory: %w", err)
	}

	repo, err := git.PlainInit(repoPath, true)
	if err != nil {
		os.RemoveAll(repoPath)
		return "", fmt.Errorf("init bare repo: %w", err)
	}

	treeHash, err := g.createEmptyTree(repo)
	if err != nil {
		os.RemoveAll(repoPath)
		return "", fmt.Errorf("create empty tree: %w", err)
	}

	commitHash, err := g.createInitialCommit(repo, treeHash)
	if err != nil {
		os.RemoveAll(repoPath)
		return "", fmt.Errorf("create initial commit: %w", err)
	}

	mainRef := plumbing.NewHashReference(plumbing.ReferenceName("refs/heads/main"), commitHash)
	if err := repo.Storer.SetReference(mainRef); err != nil {
		os.RemoveAll(repoPath)
		return "", fmt.Errorf("set main ref: %w", err)
	}

	headRef := plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.ReferenceName("refs/heads/main"))
	if err := repo.Storer.SetReference(headRef); err != nil {
		os.RemoveAll(repoPath)
		return "", fmt.Errorf("set HEAD: %w", err)
	}

	return repoPath, nil
}

func (g *GitService) DeleteRepo(projectID string) error {
	repoPath := filepath.Join(g.repoBasePath, projectID)
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		return nil
	}
	return os.RemoveAll(repoPath)
}

func (g *GitService) CreateBranch(projectID, branchName, sourceBranch string) (string, error) {
	repo, err := g.openRepo(projectID)
	if err != nil {
		return "", err
	}

	sourceRefName := plumbing.ReferenceName("refs/heads/" + sourceBranch)
	sourceRef, err := repo.Storer.Reference(sourceRefName)
	if err != nil {
		return "", fmt.Errorf("source branch %q not found: %w", sourceBranch, err)
	}

	targetRefName := plumbing.ReferenceName("refs/heads/" + branchName)
	if _, err := repo.Storer.Reference(targetRefName); err == nil {
		return "", fmt.Errorf("branch %q already exists", branchName)
	}

	targetRef := plumbing.NewHashReference(targetRefName, sourceRef.Hash())
	if err := repo.Storer.SetReference(targetRef); err != nil {
		return "", fmt.Errorf("create branch ref: %w", err)
	}

	return sourceRef.Hash().String(), nil
}

func (g *GitService) ListBranches(projectID string) ([]string, error) {
	repo, err := g.openRepo(projectID)
	if err != nil {
		return nil, err
	}

	iter, err := repo.Storer.IterReferences()
	if err != nil {
		return nil, fmt.Errorf("iterate references: %w", err)
	}
	defer iter.Close()

	var branches []string
	err = iter.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().String()
		if strings.HasPrefix(name, "refs/heads/") {
			branches = append(branches, ref.Name().Short())
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("iterate branches: %w", err)
	}

	return branches, nil
}

func (g *GitService) DeleteBranch(projectID, branchName string) error {
	if branchName == "main" {
		return fmt.Errorf("cannot delete the default branch")
	}

	repo, err := g.openRepo(projectID)
	if err != nil {
		return err
	}

	refName := plumbing.ReferenceName("refs/heads/" + branchName)
	if _, err := repo.Storer.Reference(refName); err != nil {
		return fmt.Errorf("branch %q not found", branchName)
	}

	return repo.Storer.RemoveReference(refName)
}

func (g *GitService) GetBranchHash(projectID, branchName string) (string, error) {
	repo, err := g.openRepo(projectID)
	if err != nil {
		return "", err
	}

	ref, err := repo.Storer.Reference(plumbing.ReferenceName("refs/heads/" + branchName))
	if err != nil {
		return "", fmt.Errorf("branch %q not found: %w", branchName, err)
	}

	return ref.Hash().String(), nil
}

func (g *GitService) openRepo(projectID string) (*git.Repository, error) {
	repoPath := filepath.Join(g.repoBasePath, projectID)
	repo, err := git.PlainOpen(repoPath)
	if err != nil {
		return nil, fmt.Errorf("open repo at %s: %w", repoPath, err)
	}
	return repo, nil
}

func (g *GitService) createEmptyTree(repo *git.Repository) (plumbing.Hash, error) {
	obj := repo.Storer.NewEncodedObject()
	tree := &object.Tree{}
	if err := tree.Encode(obj); err != nil {
		return plumbing.ZeroHash, fmt.Errorf("encode tree: %w", err)
	}
	return repo.Storer.SetEncodedObject(obj)
}

func (g *GitService) createInitialCommit(repo *git.Repository, treeHash plumbing.Hash) (plumbing.Hash, error) {
	sig := object.Signature{
		Name:  "Artifact",
		Email: "artifact@server",
	}

	commit := &object.Commit{
		Message:   "Initial commit",
		TreeHash:  treeHash,
		Author:    sig,
		Committer: sig,
	}

	obj := repo.Storer.NewEncodedObject()
	if err := commit.Encode(obj); err != nil {
		return plumbing.ZeroHash, fmt.Errorf("encode commit: %w", err)
	}
	return repo.Storer.SetEncodedObject(obj)
}

type PointerFileEntry struct {
	Path    string
	Content string
}

func (g *GitService) CreateCommitWithFiles(projectID, branchName, message, authorName, authorEmail, parentHash string, entries []PointerFileEntry) (string, error) {
	repo, err := g.openRepo(projectID)
	if err != nil {
		return "", err
	}

	var parentCommit *object.Commit
	if parentHash != "" {
		hash := plumbing.NewHash(parentHash)
		parentCommit, err = object.GetCommit(repo.Storer, hash)
		if err != nil {
			parentCommit = nil
		}
	}

	var treeEntries []object.TreeEntry
	if parentCommit != nil {
		parentTree, err := object.GetTree(repo.Storer, parentCommit.TreeHash)
		if err == nil {
			treeEntries = parentTree.Entries
		}
	}

	for _, entry := range entries {
		content := []byte(entry.Content)
		blobObj := repo.Storer.NewEncodedObject()
		blobObj.SetType(plumbing.BlobObject)
		blobObj.SetSize(int64(len(content)))
		w, err := blobObj.Writer()
		if err != nil {
			return "", fmt.Errorf("blob writer for %s: %w", entry.Path, err)
		}
		w.Write(content)
		w.Close()
		blobHash, err := repo.Storer.SetEncodedObject(blobObj)
		if err != nil {
			return "", fmt.Errorf("store blob for %s: %w", entry.Path, err)
		}

		treeEntries = append(treeEntries, object.TreeEntry{
			Name: entry.Path,
			Mode: filemode.Regular,
			Hash: blobHash,
		})
	}

	treeObj := repo.Storer.NewEncodedObject()
	tree := object.Tree{Entries: treeEntries}
	if err := tree.Encode(treeObj); err != nil {
		return "", fmt.Errorf("encode tree: %w", err)
	}
	treeHash, err := repo.Storer.SetEncodedObject(treeObj)
	if err != nil {
		return "", fmt.Errorf("store tree: %w", err)
	}

	sig := object.Signature{
		Name:  authorName,
		Email: authorEmail,
	}

	commitObj := object.Commit{
		Message:   message,
		TreeHash:  treeHash,
		Author:    sig,
		Committer: sig,
	}
	if parentCommit != nil {
		commitObj.ParentHashes = []plumbing.Hash{parentCommit.Hash}
	}

	cObj := repo.Storer.NewEncodedObject()
	if err := commitObj.Encode(cObj); err != nil {
		return "", fmt.Errorf("encode commit: %w", err)
	}
	commitHash, err := repo.Storer.SetEncodedObject(cObj)
	if err != nil {
		return "", fmt.Errorf("store commit: %w", err)
	}

	refName := plumbing.ReferenceName("refs/heads/" + branchName)
	ref := plumbing.NewHashReference(refName, commitHash)
	if err := repo.Storer.SetReference(ref); err != nil {
		return "", fmt.Errorf("update branch ref: %w", err)
	}

	return commitHash.String(), nil
}
