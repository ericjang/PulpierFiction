var request = require('request');

module.exports = wordsToImage;

// Returns the longest word in a string array
// usage:
// longest(['the', 'party', 'cat], callback);
function longest(strArray) {
  var longest = strArray[0];
  strArray.forEach(function(word, i) {
    if(word.length > longest.length) {
      longest = word;
    }
  });
  return longest;
}

// Returns the post with the highest note count from an array of photo posts.
//usage:
// highest
function highestNoteCount(taggedPhotoPosts) {
  var mostPopular = taggedPhotoPosts[0];
  var empty;
  taggedPhotoPosts.forEach(function(post, i) {
    empty = (post.photos.length > 0);
    if((post.note_count > mostPopular.note_count) && (empty)) {
      mostPopular = post;
    }
  });
  return mostPopular;
}

//
// usage:
// wordsToImage(['the', 'party', 'cat'], callback);
// callback(error, image_url);
//
function wordsToImage(words, callback) {
  if (words.length !== 3) {
    console.log(new Error('tumblr.wordsToImage: too many words').stack);
  }
  //maybe offset 100,000 from timestamp to get more posts.
  var tag_retrieval_options = {
    uri: 'https://api.tumblr.com/v2/tagged?tag=' + longest(words)
     + '&type=photo&limit=20&api_key=pCL9bYclNakXdfMU42O08O20QFwfgMk1bJnYSoEwL23eWabqHv'
  , method: 'GET'
  , json: true
  };

  return request(tag_retrieval_options, function(err, res, body) {
    if (err) return callback(new Error(err.message));

    // console.log(body);
    var image_url = null;
    var posts = body.response;

    var photoPostArray =  posts.filter(function(post) {
      return post.photos && post.photos.length;
    });
    var bestPhotoPost = highestNoteCount(photoPostArray);

    if (!bestPhotoPost || !bestPhotoPost.photos || !bestPhotoPost.photos.length) {
      return callback(err, "");
    }
    image_url = (bestPhotoPost.photos[0]).alt_sizes.shift().url;
    return callback(err, image_url, bestPhotoPost.note_count);
  });
}


if (!module.parent) {
  var string1 = "th";
  var string2 = "pa";
  var string3 = "cat";

  wordsToImage([string1, string2, string3], function(err, image_url) {
    console.log(image_url);
  });
}
